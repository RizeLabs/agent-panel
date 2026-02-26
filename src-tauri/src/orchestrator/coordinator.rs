use tauri::{AppHandle, Manager};

use crate::agents::manager;
use crate::db::queries::{self, Agent, Task};
use crate::orchestrator::message_bus;
use crate::state::AppState;

/// Default coordinator loop interval in seconds.
const DEFAULT_COORDINATOR_INTERVAL_SECS: u64 = 120;

/// The base system prompt given to every coordinator agent.
/// When a swarm goal is provided it is prepended as an objective function.
const COORDINATOR_BASE_PROMPT: &str = r#"You are a coordination agent. Review the following findings and messages from your team, synthesize key insights, identify gaps, and suggest next steps. Output your analysis as structured JSON with fields: insights (array of strings), tasks (array of {title, description, priority, assigned_to}), questions (array of strings for human review)."#;

/// Build the full coordinator system prompt, optionally prepending the swarm goal.
fn coordinator_system_prompt(goal: Option<&str>) -> String {
    match goal {
        Some(g) if !g.is_empty() => format!(
            "=== SWARM OBJECTIVE (your optimisation target) ===\n{}\n\
             === END OBJECTIVE ===\n\n\
             All of your coordination decisions — task assignments, priority ordering, \
             gap analysis — must be evaluated against how well they advance this objective.\n\n{}",
            g, COORDINATOR_BASE_PROMPT
        ),
        _ => COORDINATOR_BASE_PROMPT.to_string(),
    }
}

/// Output structure expected from the coordinator agent.
#[derive(Debug, serde::Deserialize)]
struct CoordinatorOutput {
    #[serde(default)]
    insights: Vec<String>,
    #[serde(default)]
    tasks: Vec<CoordinatorTask>,
    #[serde(default)]
    questions: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
struct CoordinatorTask {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    assigned_to: Option<String>,
}

/// Create a dedicated coordinator agent for a swarm.
///
/// The agent is persisted in the database with a well-known role
/// (`"coordinator"`) and the coordinator system prompt.
/// Returns the new agent's ID.
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
        created_at: String::new(),
        updated_at: String::new(),
    };

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_agent(&conn, &agent)
        .map_err(|e| format!("Failed to insert coordinator agent: {}", e))?;

    log::info!("Created coordinator agent {} for swarm '{}'", agent_id, swarm_name);
    Ok(agent_id)
}

/// Asynchronous coordinator loop.
///
/// On each tick the loop:
/// 1. Checks if the parent swarm is still running (exits if stopped).
/// 2. Gathers recent knowledge entries and unread messages.
/// 3. Builds a synthesis prompt combining all gathered information.
/// 4. Injects the prompt into the coordinator agent and (re)starts it.
/// 5. Waits briefly, then attempts to parse the coordinator's output to create
///    new tasks and knowledge entries.
pub async fn coordinator_loop(
    app_handle: AppHandle,
    coordinator_id: &str,
    swarm_id: &str,
) {
    let interval = std::time::Duration::from_secs(DEFAULT_COORDINATOR_INTERVAL_SECS);
    let state = app_handle.state::<AppState>();

    loop {
        tokio::time::sleep(interval).await;

        // Check if the swarm is still running and fetch its goal
        let (swarm_status, swarm_goal) = {
            let conn = match state.db.lock() {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Coordinator loop DB lock error: {}", e);
                    continue;
                }
            };
            match queries::get_swarm(&conn, swarm_id) {
                Ok(Some(s)) => (s.status, s.goal),
                Ok(None) => {
                    log::warn!(
                        "Swarm {} no longer exists, exiting coordinator loop",
                        swarm_id
                    );
                    return;
                }
                Err(e) => {
                    log::error!("Coordinator loop: failed to get swarm: {}", e);
                    continue;
                }
            }
        };

        if swarm_status != "running" {
            log::info!(
                "Swarm {} status is '{}', exiting coordinator loop",
                swarm_id,
                swarm_status
            );
            return;
        }

        // Gather recent knowledge entries
        let knowledge_entries = {
            let conn = match state.db.lock() {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Coordinator loop DB lock error: {}", e);
                    continue;
                }
            };
            queries::get_knowledge(&conn, None, 50).unwrap_or_default()
        };

        // Gather unread messages for the coordinator
        let pending_messages =
            match message_bus::get_pending_messages(&state.db, coordinator_id) {
                Ok(msgs) => msgs,
                Err(e) => {
                    log::error!(
                        "Coordinator loop: failed to get pending messages: {}",
                        e
                    );
                    Vec::new()
                }
            };

        // Build the synthesis prompt (goal-aware)
        let synthesis_prompt = build_synthesis_prompt(
            swarm_goal.as_deref(),
            &knowledge_entries,
            &pending_messages,
        );

        // Mark messages as read
        if !pending_messages.is_empty() {
            let msg_ids: Vec<i64> = pending_messages.iter().map(|m| m.id).collect();
            if let Err(e) = message_bus::mark_read(&state.db, &msg_ids, coordinator_id) {
                log::error!(
                    "Coordinator loop: failed to mark messages read: {}",
                    e
                );
            }
        }

        // Inject the synthesis prompt into the coordinator agent
        {
            let conn = match state.db.lock() {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Coordinator loop DB lock error: {}", e);
                    continue;
                }
            };
            let agent = match queries::get_agent_by_id(&conn, coordinator_id) {
                Ok(Some(a)) => a,
                Ok(None) => {
                    log::error!("Coordinator agent {} not found", coordinator_id);
                    return;
                }
                Err(e) => {
                    log::error!("Coordinator loop: failed to get agent: {}", e);
                    continue;
                }
            };

            let base = coordinator_system_prompt(swarm_goal.as_deref());
            let updated_prompt = format!("{}\n\n{}", base, synthesis_prompt);
            let mut updated_agent = agent.clone();
            updated_agent.system_prompt = Some(updated_prompt);

            if let Err(e) = queries::update_agent(&conn, &updated_agent) {
                log::error!(
                    "Coordinator loop: failed to update agent prompt: {}",
                    e
                );
                continue;
            }
        }

        // Stop the coordinator (if running) and restart it with the updated prompt
        let _ = manager::stop_agent(&state, coordinator_id);
        if let Err(e) =
            manager::spawn_agent(app_handle.clone(), &state, coordinator_id).await
        {
            log::error!(
                "Coordinator loop: failed to start coordinator: {}",
                e
            );
            continue;
        }

        // Allow some time for the coordinator to produce output, then parse it
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        // Attempt to read coordinator output from the agent logs
        if let Err(e) = process_coordinator_output(&state, coordinator_id) {
            log::warn!(
                "Coordinator loop: could not process output: {}",
                e
            );
        }
    }
}

/// Assemble a synthesis prompt from knowledge entries and messages.
/// When a goal is present, the coordinator is reminded to evaluate progress
/// against it and prioritise tasks that advance it.
fn build_synthesis_prompt(
    goal: Option<&str>,
    knowledge: &[queries::Knowledge],
    messages: &[queries::Message],
) -> String {
    let mut prompt = String::new();

    if let Some(g) = goal {
        if !g.is_empty() {
            prompt.push_str(&format!(
                "=== REMINDER: SWARM OBJECTIVE ===\n{}\n\
                 Evaluate all findings below against this objective. Prioritise tasks that \
                 directly advance it, flag anything that drifts off-target, and rate overall \
                 progress (0-100%).\n=== END REMINDER ===\n\n",
                g
            ));
        }
    }

    prompt.push_str("=== TEAM KNOWLEDGE BASE ===\n\n");

    if knowledge.is_empty() {
        prompt.push_str("(No knowledge entries yet.)\n\n");
    } else {
        for entry in knowledge {
            prompt.push_str(&format!(
                "* [{}] {}: {}\n  Category: {} | Tags: {} | Agent: {}\n\n",
                entry.created_at,
                entry.title,
                entry.content,
                entry.category,
                entry.tags,
                entry.agent_id,
            ));
        }
    }

    prompt.push_str("=== RECENT MESSAGES ===\n\n");

    if messages.is_empty() {
        prompt.push_str("(No new messages.)\n\n");
    } else {
        let ctx = message_bus::build_context_injection(messages);
        prompt.push_str(&ctx);
    }

    prompt.push_str(
        "\nBased on the above, provide your analysis as JSON with the fields: \
         insights, tasks, questions.",
    );
    prompt
}

/// Parse the coordinator agent's most recent log output and create tasks /
/// knowledge entries from the structured JSON.
fn process_coordinator_output(
    state: &AppState,
    coordinator_id: &str,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let logs = queries::get_agent_logs(&conn, coordinator_id, 5)
        .map_err(|e| format!("Failed to get coordinator logs: {}", e))?;

    // Try to find a JSON payload in the most recent logs
    for log_entry in &logs {
        if let Some(output) = extract_json_from_text(&log_entry.content) {
            let parsed: CoordinatorOutput = match serde_json::from_str(&output) {
                Ok(o) => o,
                Err(_) => continue,
            };

            // Store insights as knowledge entries
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

            // Create tasks
            for task in &parsed.tasks {
                let task_id = uuid::Uuid::new_v4().to_string();
                let new_task = Task {
                    id: task_id,
                    notion_page_id: None,
                    title: task.title.clone(),
                    description: task.description.clone(),
                    status: "todo".to_string(),
                    assigned_agent: task.assigned_to.clone(),
                    swarm_id: None,
                    priority: task
                        .priority
                        .clone()
                        .unwrap_or_else(|| "medium".to_string()),
                    parent_task_id: None,
                    blocked_by: "[]".to_string(),
                    created_at: String::new(),
                    updated_at: String::new(),
                };
                let _ = queries::insert_task(&conn, &new_task);
            }

            // Broadcast questions for human review
            for question in &parsed.questions {
                let _ = queries::insert_message(
                    &conn,
                    coordinator_id,
                    None,
                    "question",
                    question,
                    None,
                );
            }

            log::info!(
                "Coordinator output processed: {} insights, {} tasks, {} questions",
                parsed.insights.len(),
                parsed.tasks.len(),
                parsed.questions.len()
            );
            return Ok(());
        }
    }

    Err("No valid JSON output found in coordinator logs".to_string())
}

/// Try to extract a JSON object from free-form text by finding the first `{`
/// and last `}` and attempting to parse the substring.
fn extract_json_from_text(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end > start {
        Some(text[start..=end].to_string())
    } else {
        None
    }
}
