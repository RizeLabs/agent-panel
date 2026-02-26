use tauri::{AppHandle, Manager};

use crate::agents::manager;
use crate::db::queries::{self, Agent, Task};
use crate::integrations::telegram;
use crate::state::{AgentAssignment, AppState};

/// How often the coordinator loop ticks (seconds).
const DEFAULT_COORDINATOR_INTERVAL_SECS: u64 = 120;

/// How long to wait for the coordinator to produce output after spawning (seconds).
const COORDINATOR_OUTPUT_WAIT_SECS: u64 = 45;

// ─── Coordinator System Prompt ────────────────────────────────

/// Static base instructions given to every coordinator agent.
/// Current state (tasks, agents, messages) is injected as the initial prompt (`-p`).
const COORDINATOR_BASE_PROMPT: &str = r#"You are the coordinator for this AI agent swarm. You have full visibility of all tasks, agents, and progress.

Your responsibilities:
1. DELEGATE — Assign "todo" tasks to the right agent. Write precise, actionable instructions: what to build, relevant file paths, and a clear definition of done.
2. REVIEW — When you receive a completion report, evaluate the work carefully. Only mark a task complete when it meets the requirements.
3. REJECT — If work is insufficient, reject it with specific feedback so the agent can improve and retry.
4. ESCALATE — If a decision requires human judgment, add a concise question to human_queries.
5. CREATE — Add new sub-tasks to new_tasks if you identify work needed to achieve the goal.

Respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "insights": ["key observations about progress"],
  "task_assignments": [
    { "task_id": "...", "agent_id": "...", "instructions": "..." }
  ],
  "task_completions": ["task_id"],
  "task_rejections": [
    { "task_id": "...", "agent_id": "...", "feedback": "specific actionable feedback" }
  ],
  "human_queries": ["question for the human operator"],
  "new_tasks": [
    { "title": "...", "description": "...", "priority": "high|medium|low", "assigned_to": "agent_id_or_null" }
  ]
}

Only assign tasks that have status "todo".
Only complete a task when you have reviewed its completion report and are satisfied.
Return {} if there is nothing to do right now."#;

fn coordinator_system_prompt(goal: Option<&str>) -> String {
    match goal {
        Some(g) if !g.is_empty() => format!(
            "=== SWARM OBJECTIVE ===\n{}\n=== END OBJECTIVE ===\n\n{}",
            g, COORDINATOR_BASE_PROMPT
        ),
        _ => COORDINATOR_BASE_PROMPT.to_string(),
    }
}

// ─── Output Schema ────────────────────────────────────────────

#[derive(Debug, serde::Deserialize, Default)]
struct CoordinatorOutput {
    #[serde(default)]
    insights: Vec<String>,
    #[serde(default)]
    task_assignments: Vec<TaskAssignment>,
    #[serde(default)]
    task_completions: Vec<String>,
    #[serde(default)]
    task_rejections: Vec<TaskRejection>,
    #[serde(default)]
    human_queries: Vec<String>,
    #[serde(default)]
    new_tasks: Vec<NewTask>,
}

#[derive(Debug, serde::Deserialize)]
struct TaskAssignment {
    task_id: String,
    agent_id: String,
    instructions: String,
}

#[derive(Debug, serde::Deserialize)]
struct TaskRejection {
    task_id: String,
    agent_id: String,
    feedback: String,
}

#[derive(Debug, serde::Deserialize)]
struct NewTask {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    assigned_to: Option<String>,
}

// ─── Coordinator Agent Creation ───────────────────────────────

pub fn create_coordinator_agent(
    state: &AppState,
    swarm_name: &str,
    goal: Option<&str>,
) -> Result<String, String> {
    let agent_id = uuid::Uuid::new_v4().to_string();
    let agent_name = format!("{}-coordinator", swarm_name);

    let agent = Agent {
        id: agent_id.clone(),
        name: agent_name,
        role: "coordinator".to_string(),
        system_prompt: Some(coordinator_system_prompt(goal)),
        working_directory: None,
        model: "sonnet".to_string(),
        max_turns: 10,
        skills: "[]".to_string(),
        env_vars: "{}".to_string(),
        status: "idle".to_string(),
        pid: None,
        session_id: None,
        prompt_context: None,
        created_at: String::new(),
        updated_at: String::new(),
    };

    let conn = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_agent(&conn, &agent)
        .map_err(|e| format!("Failed to insert coordinator agent: {}", e))?;

    log::info!("Created coordinator agent {} for swarm '{}'", agent_id, swarm_name);
    Ok(agent_id)
}

// ─── Coordinator Loop ─────────────────────────────────────────

/// Asynchronous coordinator loop. Runs immediately on start then every
/// `DEFAULT_COORDINATOR_INTERVAL_SECS` seconds.
///
/// Each tick:
/// 1. Checks if the swarm is still running.
/// 2. Builds a synthesis prompt with full project state.
/// 3. Updates coordinator system prompt and spawns it fresh.
/// 4. Waits for output, then processes decisions.
///
/// IMPORTANT: All `MutexGuard` values are dropped before any `.await` by
/// returning Results from scoped blocks and handling them outside.
pub async fn coordinator_loop(app_handle: AppHandle, coordinator_id: &str, swarm_id: &str) {
    let interval = std::time::Duration::from_secs(DEFAULT_COORDINATOR_INTERVAL_SECS);
    let state = app_handle.state::<AppState>();

    loop {
        // ── 1. Check if swarm is still running ───────────────
        // All DB work is done inside a sync block so that the MutexGuard is
        // dropped before any .await.  We return a plain Result/Option from the
        // block and do the await outside.
        let swarm_check: Result<Option<(String, Option<String>, String)>, String> = {
            match state.db.lock() {
                Err(e) => Err(format!("DB lock error: {}", e)),
                Ok(conn) => match queries::get_swarm(&conn, swarm_id) {
                    Ok(Some(s)) => Ok(Some((s.status, s.goal, s.name))),
                    Ok(None) => Ok(None),
                    Err(e) => Err(format!("Failed to get swarm: {}", e)),
                }, // conn dropped here
            }
        };

        let (swarm_status, swarm_goal, swarm_name) = match swarm_check {
            Err(e) => {
                log::error!("Coordinator loop: {}", e);
                tokio::time::sleep(interval).await; // safe: no lock held
                continue;
            }
            Ok(None) => {
                log::warn!("Swarm {} gone, exiting coordinator loop", swarm_id);
                return;
            }
            Ok(Some(data)) => data,
        };

        if swarm_status != "running" {
            log::info!(
                "Swarm {} is '{}', exiting coordinator loop",
                swarm_id,
                swarm_status
            );
            return;
        }

        // ── 2. Build synthesis prompt with full state ─────────
        // Collect all DB data in a sync block, drop conn, then proceed.
        let synthesis_result: Result<String, String> = {
            match state.db.lock() {
                Err(e) => Err(format!("DB lock error: {}", e)),
                Ok(conn) => {
                    let tasks = queries::get_tasks(&conn, None, None).unwrap_or_default();
                    let agents = queries::get_all_agents(&conn).unwrap_or_default();
                    let knowledge = queries::get_knowledge(&conn, None, 20).unwrap_or_default();

                    // Use conn directly — do NOT call message_bus here, it would
                    // try to re-lock state.db causing a deadlock.
                    let messages = queries::get_unread_messages_for_agent(&conn, coordinator_id)
                        .unwrap_or_default();

                    // Mark messages read while conn is still in scope
                    if !messages.is_empty() {
                        let ids: Vec<i64> = messages.iter().map(|m| m.id).collect();
                        let _ = queries::mark_messages_read(&conn, &ids, coordinator_id);
                    }

                    Ok(build_synthesis_prompt(
                        swarm_goal.as_deref(),
                        &swarm_name,
                        &tasks,
                        &agents,
                        &knowledge,
                        &messages,
                    ))
                    // conn dropped here
                }
            }
        };

        let synthesis = match synthesis_result {
            Ok(s) => s,
            Err(e) => {
                log::error!("Coordinator loop: failed to build synthesis: {}", e);
                tokio::time::sleep(interval).await; // safe: no lock held
                continue;
            }
        };

        // ── 3. Clear session, update prompt ───────────────────
        // Sync block: update DB, drop conn, then do async spawn below.
        {
            match state.db.lock() {
                Err(e) => log::error!("Coordinator loop: DB lock error updating prompt: {}", e),
                Ok(conn) => {
                    let full_prompt = format!(
                        "{}\n\n{}",
                        coordinator_system_prompt(swarm_goal.as_deref()),
                        synthesis
                    );
                    if let Ok(Some(mut agent)) =
                        queries::get_agent_by_id(&conn, coordinator_id)
                    {
                        agent.system_prompt = Some(full_prompt);
                        agent.session_id = None; // always start fresh
                        if let Err(e) = queries::update_agent(&conn, &agent) {
                            log::error!("Coordinator loop: failed to update agent: {}", e);
                        }
                        let _ = queries::update_agent_process(&conn, coordinator_id, None, None);
                    }
                    // conn dropped here — safe to .await after this block
                }
            }
        }

        // Stop if somehow running, then spawn fresh
        let _ = manager::stop_agent(&state, coordinator_id);
        if let Err(e) = manager::spawn_agent(app_handle.clone(), &state, coordinator_id).await {
            log::error!("Coordinator loop: failed to start coordinator: {}", e);
            tokio::time::sleep(interval).await;
            continue;
        }

        // ── 4. Wait for output, then process ──────────────────
        tokio::time::sleep(std::time::Duration::from_secs(COORDINATOR_OUTPUT_WAIT_SECS)).await;

        if let Err(e) = process_coordinator_output(&app_handle, coordinator_id, swarm_id).await {
            log::warn!("Coordinator loop: could not process output: {}", e);
        }

        tokio::time::sleep(interval).await;
    }
}

// ─── Synthesis Prompt Builder ─────────────────────────────────

fn build_synthesis_prompt(
    goal: Option<&str>,
    swarm_name: &str,
    tasks: &[Task],
    agents: &[Agent],
    knowledge: &[queries::Knowledge],
    messages: &[queries::Message],
) -> String {
    let mut s = String::new();

    s.push_str(&format!("=== CURRENT STATE FOR SWARM: {} ===\n\n", swarm_name));

    if let Some(g) = goal {
        if !g.is_empty() {
            s.push_str(&format!("OBJECTIVE: {}\n\n", g));
        }
    }

    // Agent roster
    s.push_str("AGENT ROSTER:\n");
    let member_agents: Vec<&Agent> =
        agents.iter().filter(|a| a.role != "coordinator").collect();
    if member_agents.is_empty() {
        s.push_str("  (no member agents)\n");
    } else {
        for agent in &member_agents {
            let wd = agent
                .working_directory
                .as_deref()
                .filter(|w| !w.is_empty())
                .map(|w| format!(" | workdir: {}", w))
                .unwrap_or_default();
            s.push_str(&format!(
                "  [{}] {} — role: {}  status: {}{}\n",
                agent.id, agent.name, agent.role, agent.status, wd
            ));
        }
    }
    s.push('\n');

    // Task board
    s.push_str("TASK BOARD:\n");
    for status in &["todo", "in_progress", "blocked", "done"] {
        let group: Vec<&Task> = tasks.iter().filter(|t| t.status == *status).collect();
        if group.is_empty() {
            continue;
        }
        s.push_str(&format!("  [{}]\n", status.to_uppercase()));
        for task in group {
            let agent_label = task
                .assigned_agent
                .as_ref()
                .and_then(|id| agents.iter().find(|a| &a.id == id))
                .map(|a| format!(" → {}", a.name))
                .unwrap_or_default();
            s.push_str(&format!(
                "    ({}) {} [{}]{}\n",
                task.priority, task.title, task.id, agent_label
            ));
            if let Some(ref desc) = task.description {
                if !desc.is_empty() {
                    let truncated =
                        if desc.len() > 120 { &desc[..120] } else { desc };
                    s.push_str(&format!("      {}\n", truncated));
                }
            }
        }
    }
    s.push('\n');

    // Completion reports (highest priority — must be reviewed)
    let reports: Vec<&queries::Message> = messages
        .iter()
        .filter(|m| m.message_type == "completion_report")
        .collect();
    if !reports.is_empty() {
        s.push_str("COMPLETION REPORTS (review required):\n");
        for msg in &reports {
            s.push_str(&format!("{}\n\n", msg.content));
        }
    }

    // Knowledge base (recent)
    if !knowledge.is_empty() {
        s.push_str("RECENT KNOWLEDGE:\n");
        for entry in knowledge.iter().take(15) {
            let snippet = if entry.content.len() > 150 {
                format!("{}…", &entry.content[..150])
            } else {
                entry.content.clone()
            };
            s.push_str(&format!(
                "  • [{}] {}: {}\n",
                entry.category, entry.title, snippet
            ));
        }
        s.push('\n');
    }

    // Other messages
    let other_msgs: Vec<&queries::Message> = messages
        .iter()
        .filter(|m| m.message_type != "completion_report")
        .collect();
    if !other_msgs.is_empty() {
        s.push_str("OTHER MESSAGES:\n");
        for msg in &other_msgs {
            s.push_str(&format!(
                "  [{}] from {}: {}\n",
                msg.message_type, msg.from_agent, msg.content
            ));
        }
        s.push('\n');
    }

    s.push_str(
        "Review the above and output your coordination decisions as JSON.",
    );
    s
}

// ─── Output Processing ────────────────────────────────────────

async fn process_coordinator_output(
    app_handle: &AppHandle,
    coordinator_id: &str,
    swarm_id: &str,
) -> Result<(), String> {
    let state = app_handle.state::<AppState>();

    // Grab last few log entries from the coordinator
    let logs = {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
        queries::get_agent_logs(&conn, coordinator_id, 10)
            .map_err(|e| format!("Failed to get logs: {}", e))?
    };

    // Find JSON in the output
    let json_str = logs
        .iter()
        .find_map(|l| extract_json_from_text(&l.content))
        .ok_or_else(|| "No JSON found in coordinator output".to_string())?;

    let parsed: CoordinatorOutput = serde_json::from_str(&json_str)
        .map_err(|e| format!("JSON parse error: {}", e))?;

    log::info!(
        "Coordinator output: {} assignments, {} completions, {} rejections, {} queries, {} new tasks",
        parsed.task_assignments.len(),
        parsed.task_completions.len(),
        parsed.task_rejections.len(),
        parsed.human_queries.len(),
        parsed.new_tasks.len(),
    );

    // ── Handle task completions ───────────────────────────────
    {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
        for task_id in &parsed.task_completions {
            if let Err(e) = queries::update_task_status(&conn, task_id, "done") {
                log::warn!("Failed to mark task {} done: {}", task_id, e);
            } else {
                log::info!("Coordinator marked task {} as done", task_id);
                // Remove assignment if any
                let mut assignments =
                    state.agent_assignments.lock().unwrap();
                assignments.retain(|_, v| v.task_id != *task_id);
            }
        }
    }

    // ── Handle insights → knowledge base ─────────────────────
    {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
        for insight in &parsed.insights {
            let _ = queries::insert_knowledge(
                &conn,
                coordinator_id,
                "coordinator-insight",
                "Coordinator Insight",
                insight,
                "[]",
            );
        }
    }

    // ── Handle new tasks ──────────────────────────────────────
    {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
        for new_task in &parsed.new_tasks {
            let task = Task {
                id: uuid::Uuid::new_v4().to_string(),
                notion_page_id: None,
                title: new_task.title.clone(),
                description: new_task.description.clone(),
                status: "todo".to_string(),
                assigned_agent: new_task.assigned_to.clone(),
                swarm_id: Some(swarm_id.to_string()),
                priority: new_task
                    .priority
                    .clone()
                    .unwrap_or_else(|| "medium".to_string()),
                parent_task_id: None,
                blocked_by: "[]".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            };
            let _ = queries::insert_task(&conn, &task);
        }
    }

    // ── Collect assignments and rejections for async handling ─
    // We need to release all DB locks before any .await

    let assignments_work: Vec<(String, String, String)> = {
        let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut work = Vec::new();
        for assignment in &parsed.task_assignments {
            if let Err(e) = queries::update_task_status(
                &conn,
                &assignment.task_id,
                "in_progress",
            ) {
                log::warn!("Failed to update task {} status: {}", assignment.task_id, e);
            }
            // Update task's assigned_agent
            if let Ok(Some(mut task)) =
                queries::get_tasks(&conn, None, None)
                    .map(|tasks| tasks.into_iter().find(|t| t.id == assignment.task_id))
            {
                task.assigned_agent = Some(assignment.agent_id.clone());
                let _ = queries::update_task(&conn, &task);
            }
            work.push((
                assignment.task_id.clone(),
                assignment.agent_id.clone(),
                assignment.instructions.clone(),
            ));
        }
        work
    };

    let rejections_work: Vec<(String, String, String)> = parsed
        .task_rejections
        .iter()
        .map(|r| (r.task_id.clone(), r.agent_id.clone(), r.feedback.clone()))
        .collect();

    // ── Inject context + spawn agents for assignments ─────────
    for (task_id, agent_id, instructions) in &assignments_work {
        let context = format!(
            "\n\n=== TASK ASSIGNED BY COORDINATOR ===\nTask ID: {}\nInstructions:\n{}\n\
             When complete, your work will be reviewed by the coordinator before the task is marked done.\n\
             === END TASK ===",
            task_id, instructions
        );

        // Clear session so agent starts fresh with the task context
        {
            let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
            let _ = queries::update_agent_process(&conn, agent_id, None, None);
        }

        if let Err(e) = inject_context_into_agent(&state, agent_id, &context) {
            log::warn!("Failed to inject task context into agent {}: {}", agent_id, e);
            continue;
        }

        let _ = manager::stop_agent(&state, agent_id); // stop if somehow running
        if let Err(e) =
            manager::spawn_agent(app_handle.clone(), &state, agent_id).await
        {
            log::error!(
                "Failed to start agent {} for task {}: {}",
                agent_id, task_id, e
            );
            continue;
        }

        // Clear prompt_context — delivered via -p on this fresh session.
        if let Ok(conn) = state.db.lock() {
            let _ = queries::update_agent_context(&conn, agent_id, None);
        }

        // Register assignment so completion report is routed to coordinator
        {
            let mut assignments = state.agent_assignments.lock().unwrap();
            assignments.insert(
                agent_id.clone(),
                AgentAssignment {
                    task_id: task_id.clone(),
                    coordinator_id: coordinator_id.to_string(),
                },
            );
        }

        log::info!("Assigned task {} to agent {}", task_id, agent_id);
    }

    // ── Handle rejections: inject feedback + restart ──────────
    for (task_id, agent_id, feedback) in &rejections_work {
        // Move task back to in_progress
        {
            let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
            let _ = queries::update_task_status(&conn, task_id, "in_progress");
        }

        let context = format!(
            "\n\n=== COORDINATOR FEEDBACK — TASK NEEDS REVISION ===\nTask ID: {}\nFeedback:\n{}\n\
             Please address the above feedback and complete the task.\n\
             === END FEEDBACK ===",
            task_id, feedback
        );

        if let Err(e) = inject_context_into_agent(&state, agent_id, &context) {
            log::warn!(
                "Failed to inject rejection feedback into agent {}: {}",
                agent_id, e
            );
            continue;
        }

        let _ = manager::stop_agent(&state, agent_id);
        if let Err(e) =
            manager::spawn_agent(app_handle.clone(), &state, agent_id).await
        {
            log::error!("Failed to restart agent {} after rejection: {}", agent_id, e);
            continue;
        }

        // Clear prompt_context — delivered via -p on this fresh session.
        if let Ok(conn) = state.db.lock() {
            let _ = queries::update_agent_context(&conn, agent_id, None);
        }

        // Re-register assignment
        {
            let mut assignments = state.agent_assignments.lock().unwrap();
            assignments.insert(
                agent_id.clone(),
                AgentAssignment {
                    task_id: task_id.clone(),
                    coordinator_id: coordinator_id.to_string(),
                },
            );
        }

        log::info!("Rejected task {} — restarted agent {} with feedback", task_id, agent_id);
    }

    // ── Route human queries via Telegram ──────────────────────
    if !parsed.human_queries.is_empty() {
        let (bot_token, chat_id) = {
            let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
            (
                queries::get_setting(&conn, "telegram_bot_token")
                    .ok()
                    .flatten(),
                queries::get_setting(&conn, "telegram_chat_id")
                    .ok()
                    .flatten(),
            )
        };

        if let (Some(token), Some(chat)) = (bot_token, chat_id) {
            for query in &parsed.human_queries {
                if let Err(e) = telegram::notify_human_needed(
                    &token,
                    &chat,
                    "coordinator",
                    query,
                )
                .await
                {
                    log::warn!("Failed to send human query via Telegram: {}", e);
                }
            }
        } else {
            // Fall back to message bus if Telegram not configured
            let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
            for query in &parsed.human_queries {
                let _ = queries::insert_message(
                    &conn,
                    coordinator_id,
                    None,
                    "question",
                    query,
                    None,
                );
            }
        }
    }

    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────

/// Replace the agent's ephemeral prompt_context with new context.
/// Never touches system_prompt — prevents unbounded growth.
fn inject_context_into_agent(
    state: &AppState,
    agent_id: &str,
    context: &str,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| format!("DB lock: {}", e))?;
    queries::update_agent_context(&conn, agent_id, Some(context))
        .map_err(|e| format!("Failed to update agent context: {}", e))
}

fn extract_json_from_text(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end > start {
        Some(text[start..=end].to_string())
    } else {
        None
    }
}
