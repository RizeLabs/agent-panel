use crate::agents::output_parser::{self, StreamEvent};
use crate::db::queries;
use crate::state::{AgentAssignment, AppState, InputWaitInfo, ProcessHandle};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use std::process::Stdio;
use std::time::Instant;

// ─── Event Payloads ──────────────────────────────────────────

/// Payload emitted via the `agent-log` Tauri event whenever the agent
/// produces output, uses a tool, or encounters an error.
#[derive(Debug, Clone, Serialize)]
pub struct AgentLogPayload {
    pub agent_id: String,
    pub log_type: String,
    pub content: String,
}

/// Payload emitted via the `agent-status-change` Tauri event when
/// the agent's lifecycle state changes.
#[derive(Debug, Clone, Serialize)]
pub struct AgentStatusPayload {
    pub agent_id: String,
    pub status: String,
    pub session_id: Option<String>,
}

// ─── Spawn Agent ─────────────────────────────────────────────

/// Spawn a `claude` CLI process for the given agent.
///
/// 1. Reads the agent configuration from the DB.
/// 2. Builds the CLI command with the appropriate flags.
/// 3. Spawns the process, capturing stdout for streaming output.
/// 4. Stores the PID and updates the agent status to "running".
/// 5. Registers the `ProcessHandle` in `state.processes`.
/// 6. Spawns a background tokio task that reads stdout line-by-line,
///    parses each line with the output parser, emits Tauri events,
///    and persists logs into the database.
pub async fn spawn_agent(
    app_handle: AppHandle,
    state: &AppState,
    agent_id: &str,
) -> Result<(), String> {
    // ── 1. Load agent config from DB ─────────────────────────
    let agent = {
        let db = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
        queries::get_agent_by_id(&db, agent_id)
            .map_err(|e| format!("DB error: {}", e))?
            .ok_or_else(|| format!("Agent not found: {}", agent_id))?
    };

    // Prevent double-start: check the live process registry, not the DB status.
    // DB status can be stale after an app restart — processes are in-memory only,
    // so "running" in the DB after a restart just means it was running before the crash.
    {
        let procs = state
            .processes
            .lock()
            .map_err(|e| format!("Process registry lock error: {}", e))?;
        if procs.contains_key(agent_id) {
            return Err(format!("Agent {} is already running", agent_id));
        }
    }

    // ── 1b. Ensure claude-mem is configured for this agent ──
    if let Some(ref wd) = agent.working_directory {
        if !wd.is_empty() {
            if let Err(e) = crate::integrations::claude_mem::ensure_claude_mem_configured(wd) {
                log::warn!("Could not configure claude-mem for agent {}: {}", agent_id, e);
            }
        }
    }

    // ── 2. Build the command ─────────────────────────────────
    let mut cmd = Command::new("claude");

    // If the agent already has a session_id from a previous run, resume it.
    // Otherwise start a fresh session with the system prompt.
    if let Some(ref sid) = agent.session_id {
        if !sid.is_empty() {
            cmd.arg("--resume").arg(sid);
        } else {
            add_prompt_args(&mut cmd, &agent);
        }
    } else {
        add_prompt_args(&mut cmd, &agent);
    }

    cmd.arg("--output-format")
        .arg("stream-json")
        .arg("--model")
        .arg(&agent.model)
        .arg("--max-turns")
        .arg(agent.max_turns.to_string());

    // Set working directory if configured
    if let Some(ref wd) = agent.working_directory {
        if !wd.is_empty() {
            cmd.current_dir(wd);
        }
    }

    // Inject Mission Control API env vars so agents can post to the message bus
    if let Some(port) = crate::mcp::MCP_PORT.get() {
        cmd.env("MC_API_URL", format!("http://127.0.0.1:{}", port));
        cmd.env("MC_AGENT_ID", agent_id);
    }

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // ── 3. Spawn the process ─────────────────────────────────
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude process: {}", e))?;

    let pid = child.id().map(|p| p as i64);
    let stdin = child.stdin.take();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    // ── 4. Persist PID + status in DB ────────────────────────
    {
        let db = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
        queries::update_agent_process(&db, agent_id, pid, agent.session_id.as_deref())
            .map_err(|e| format!("DB error: {}", e))?;
        queries::update_agent_status(&db, agent_id, "running")
            .map_err(|e| format!("DB error: {}", e))?;
    }

    // ── 5. Register ProcessHandle ────────────────────────────
    {
        let mut procs = state
            .processes
            .lock()
            .map_err(|e| format!("Process registry lock error: {}", e))?;
        procs.insert(
            agent_id.to_string(),
            ProcessHandle {
                child,
                session_id: agent.session_id.clone().unwrap_or_default(),
                stdin,
            },
        );
    }

    // ── 5b. Register in input-wait tracker ───────────────────
    {
        let mut waits = state
            .input_wait
            .lock()
            .map_err(|e| format!("Input wait lock error: {}", e))?;
        waits.insert(
            agent_id.to_string(),
            InputWaitInfo {
                last_output_at: Instant::now(),
                last_output_text: String::new(),
                agent_name: agent.name.clone(),
                notification_sent: false,
                might_need_input: false,
            },
        );
    }

    // ── 6. Emit initial status event ─────────────────────────
    let _ = app_handle.emit(
        "agent-status-change",
        AgentStatusPayload {
            agent_id: agent_id.to_string(),
            status: "running".to_string(),
            session_id: agent.session_id.clone(),
        },
    );

    log::info!("Agent {} spawned with PID {:?}", agent_id, pid);

    // ── 7a. Drain stderr to avoid blocking the child process ─────
    // If stderr is piped but never read, the OS pipe buffer fills up and the
    // child blocks — producing zero stdout output. We drain it here, surface
    // non-empty stderr lines to the frontend as error-typed agent-log events,
    // and persist them so the user can see what went wrong (auth errors, etc.).
    let stderr_agent_id = agent_id.to_string();
    let handle_err = app_handle.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim().to_string();
            if trimmed.is_empty() {
                continue;
            }
            log::warn!("[agent stderr {}] {}", stderr_agent_id, trimmed);
            let content = format!("[stderr] {}", trimmed);
            let _ = handle_err.emit(
                "agent-log",
                AgentLogPayload {
                    agent_id: stderr_agent_id.clone(),
                    log_type: "error".to_string(),
                    content: content.clone(),
                },
            );
            let state_err = handle_err.state::<AppState>();
            let db_lock = state_err.db.lock();
            if let Ok(db) = db_lock {
                let _ = queries::insert_log(&db, &stderr_agent_id, "error", &content);
            }
        }
    });

    // ── 7b. Spawn stdout reader task ─────────────────────────
    let agent_id_owned = agent_id.to_string();
    let handle_clone = app_handle.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            // Reset silence timer for ANY stdout line — not just parsed events.
            // If Claude outputs auth prompts, setup wizards, or any non-JSON content
            // we still know the process is alive and producing output.
            {
                let state_iw = handle_clone.state::<AppState>();
                let mut waits = state_iw.input_wait.lock().unwrap();
                if let Some(info) = waits.get_mut(&agent_id_owned) {
                    info.last_output_at = Instant::now();
                    info.notification_sent = false;
                }
            }

            if let Some(event) = output_parser::parse_stream_line(&line) {
                handle_stream_event(&handle_clone, &agent_id_owned, &event);

                // Update last_output_text and might_need_input for parsed events
                {
                    let state_iw = handle_clone.state::<AppState>();
                    let mut waits = state_iw.input_wait.lock().unwrap();
                    if let Some(info) = waits.get_mut(&agent_id_owned) {
                        match &event {
                            StreamEvent::AssistantText { text } => {
                                info.last_output_text = text.clone();
                                info.might_need_input = looks_like_question(text);
                            }
                            StreamEvent::ToolUse { tool_name, tool_input } => {
                                let preview: String = tool_input.chars().take(120).collect();
                                info.last_output_text = format!(
                                    "[tool: {}] {}",
                                    tool_name, preview
                                );
                                info.might_need_input = false;
                            }
                            _ => {}
                        }
                    }
                }
            } else if !line.trim().is_empty() {
                // Log non-JSON stdout for diagnosis (auth prompts, setup wizards, etc.)
                let preview: String = line.chars().take(300).collect();
                log::warn!("[agent {} stdout] {}", agent_id_owned, preview);
            }
        }

        // When the stream ends, the process has exited.
        // Check whether the agent is still registered (i.e. not manually stopped).
        let state_exit = handle_clone.state::<AppState>();
        let still_registered = {
            let procs = state_exit.processes.lock().unwrap();
            procs.contains_key(&agent_id_owned)
        };

        if still_registered {
            // Capture session_id from the handle before removing it, so it can be
            // persisted for future --resume. The handle's session_id is kept up-to-date
            // by handle_stream_event whenever a Result event is received.
            let exit_session_id = {
                let mut procs = state_exit.processes.lock().unwrap();
                let sid = procs
                    .get(&agent_id_owned)
                    .map(|h| h.session_id.clone())
                    .filter(|s| !s.is_empty());
                procs.remove(&agent_id_owned);
                sid
            };
            // Remove from input-wait tracker
            {
                let mut waits = state_exit.input_wait.lock().unwrap();
                waits.remove(&agent_id_owned);
            }
            {
                let db = state_exit.db.lock().unwrap();
                let _ = queries::update_agent_status(&db, &agent_id_owned, "stopped");
                let _ = queries::update_agent_process(
                    &db,
                    &agent_id_owned,
                    None,
                    exit_session_id.as_deref(),
                );
            }

            // Post completion report to coordinator if this agent had an assignment
            let assignment: Option<AgentAssignment> = {
                let mut assignments = state_exit.agent_assignments.lock().unwrap();
                assignments.remove(&agent_id_owned)
            };
            if let Some(ref assignment) = assignment {
                let summary = {
                    let db = state_exit.db.lock().unwrap();
                    queries::get_agent_logs(&db, &agent_id_owned, 20)
                        .unwrap_or_default()
                        .into_iter()
                        .filter(|l| l.log_type == "assistant")
                        .map(|l| l.content)
                        .collect::<Vec<_>>()
                        .join("\n")
                };
                let report = format!(
                    "COMPLETION REPORT\nAgent: {}\nTask ID: {}\n\nWork output:\n{}",
                    agent_id_owned, assignment.task_id, summary
                );
                let db = state_exit.db.lock().unwrap();
                let _ = queries::insert_message(
                    &db,
                    &agent_id_owned,
                    Some(&assignment.coordinator_id),
                    "completion_report",
                    &report,
                    None,
                );
                log::info!(
                    "Agent {} posted completion report for task {} to coordinator {}",
                    agent_id_owned, assignment.task_id, assignment.coordinator_id
                );
            }

            let _ = handle_clone.emit(
                "agent-status-change",
                AgentStatusPayload {
                    agent_id: agent_id_owned.clone(),
                    status: "stopped".to_string(),
                    session_id: exit_session_id,
                },
            );
            log::info!("Agent {} process exited, marked as stopped", agent_id_owned);
        }
    });

    Ok(())
}

/// Helper: compose base system_prompt + ephemeral prompt_context into `-p` for fresh sessions.
/// Also appends the Mission Control API reference so every agent knows how to post messages.
fn add_prompt_args(cmd: &mut Command, agent: &queries::Agent) {
    let base = agent.system_prompt.as_deref().unwrap_or("").trim();
    let ctx  = agent.prompt_context.as_deref().unwrap_or("").trim();
    let mut full_prompt = match (base.is_empty(), ctx.is_empty()) {
        (true,  true)  => String::new(),
        (false, true)  => base.to_string(),
        (true,  false) => ctx.to_string(),
        (false, false) => format!("{}\n\n{}", base, ctx),
    };

    // Append Mission Control API docs so agents can collaborate via the message bus.
    if let Some(port) = crate::mcp::MCP_PORT.get() {
        let api_docs = format!(
            "\n\n\
## Mission Control Collaboration API\n\
Your agent ID is available as the environment variable $MC_AGENT_ID.\n\
Base URL: $MC_API_URL (http://127.0.0.1:{port})\n\
\n\
### Post a message to the shared feed\n\
Use message_type: insight | finding | question | task_update | request | response\n\
```bash\n\
curl -s -X POST $MC_API_URL/message \\\n\
  -H 'Content-Type: application/json' \\\n\
  -d '{{\"agent_id\":\"'$MC_AGENT_ID'\",\"message_type\":\"insight\",\"content\":\"your message here\"}}'\n\
```\n\
\n\
### Add a permanent entry to the knowledge base\n\
```bash\n\
curl -s -X POST $MC_API_URL/knowledge \\\n\
  -H 'Content-Type: application/json' \\\n\
  -d '{{\"agent_id\":\"'$MC_AGENT_ID'\",\"category\":\"research\",\"title\":\"Short title\",\"content\":\"Detailed content\"}}'\n\
```\n\
\n\
### Read messages addressed to you\n\
```bash\n\
curl -s \"$MC_API_URL/messages?agent_id=$MC_AGENT_ID\"\n\
```\n\
\n\
Use these tools frequently to share progress, discoveries, and questions with other agents and the human operator.",
        );
        full_prompt.push_str(&api_docs);
    }

    if full_prompt.is_empty() {
        return;
    }
    cmd.arg("-p").arg(full_prompt);
}

/// Process a single parsed stream event: emit Tauri events and persist the log.
fn handle_stream_event(app_handle: &AppHandle, agent_id: &str, event: &StreamEvent) {
    let (log_type, content) = match event {
        StreamEvent::AssistantText { text } => ("assistant", text.clone()),
        StreamEvent::ToolUse {
            tool_name,
            tool_input,
        } => (
            "tool_use",
            format!("[{}] {}", tool_name, tool_input),
        ),
        StreamEvent::Result {
            cost_usd,
            session_id,
            duration_ms,
        } => {
            // When we get a result event, persist the session_id for future resume.
            if let Some(ref sid) = session_id {
                let state_inner = app_handle.state::<AppState>();
                let db_result = state_inner.db.lock();
                if let Ok(db) = db_result {
                    let _ = queries::update_agent_process(&db, agent_id, None, Some(sid));
                }
                let procs_result = state_inner.processes.lock();
                if let Ok(mut procs) = procs_result {
                    if let Some(handle) = procs.get_mut(agent_id) {
                        handle.session_id = sid.clone();
                    }
                }
            }

            let msg = format!(
                "cost=${:.4}, session={}, duration={}ms",
                cost_usd.unwrap_or(0.0),
                session_id.as_deref().unwrap_or("none"),
                duration_ms.unwrap_or(0),
            );
            ("result", msg)
        }
        StreamEvent::Error { message } => ("error", message.clone()),
        StreamEvent::SystemMessage { message } => ("system", message.clone()),
    };

    // Emit Tauri event to the frontend
    let _ = app_handle.emit(
        "agent-log",
        AgentLogPayload {
            agent_id: agent_id.to_string(),
            log_type: log_type.to_string(),
            content: content.clone(),
        },
    );

    // Persist the log entry into the database
    let state_inner = app_handle.state::<AppState>();
    let db_result = state_inner.db.lock();
    if let Ok(db) = db_result {
        let _ = queries::insert_log(&db, agent_id, log_type, &content);
    }
}

// ─── Stop Agent ──────────────────────────────────────────────

/// Stop a running agent by killing its process and updating the DB.
pub fn stop_agent(state: &AppState, agent_id: &str) -> Result<(), String> {
    // Remove from process registry and kill (if still running).
    // An agent may have already exited naturally (max_turns reached); that is
    // not an error — we still update the DB to reflect the stopped state.
    let maybe_handle = {
        let mut procs = state
            .processes
            .lock()
            .map_err(|e| format!("Process registry lock error: {}", e))?;
        procs.remove(agent_id)
    };

    if let Some(mut handle) = maybe_handle {
        // Send kill signal (sync version)
        handle
            .child
            .start_kill()
            .map_err(|e| format!("Failed to kill process for agent {}: {}", agent_id, e))?;

        // Update DB with the session_id we have in hand
        let db = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
        queries::update_agent_status(&db, agent_id, "stopped")
            .map_err(|e| format!("DB error: {}", e))?;
        queries::update_agent_process(&db, agent_id, None, Some(&handle.session_id))
            .map_err(|e| format!("DB error: {}", e))?;
    } else {
        // Process already exited on its own — just mark DB as stopped.
        log::debug!("stop_agent: {} has no live process, marking stopped in DB", agent_id);
        let db = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
        queries::update_agent_status(&db, agent_id, "stopped")
            .map_err(|e| format!("DB error: {}", e))?;
    }

    // Remove from input-wait tracker regardless
    {
        let mut waits = state
            .input_wait
            .lock()
            .map_err(|e| format!("Input wait lock error: {}", e))?;
        waits.remove(agent_id);
    }

    log::info!("Agent {} stopped", agent_id);
    Ok(())
}

/// Send input text to a running agent's stdin.
pub async fn send_agent_input(
    state: &AppState,
    agent_id: &str,
    input: &str,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    // Take the ChildStdin out of the ProcessHandle so we can drop the lock
    // before awaiting async I/O (MutexGuard is not Send).
    let mut taken_stdin = {
        let mut procs = state
            .processes
            .lock()
            .map_err(|e| format!("Process registry lock error: {}", e))?;

        let handle = procs
            .get_mut(agent_id)
            .ok_or_else(|| format!("No running process found for agent: {}", agent_id))?;

        handle
            .stdin
            .take()
            .ok_or_else(|| format!("No stdin handle for agent: {}", agent_id))?
    }; // MutexGuard is dropped here

    let data = format!("{}\n", input);
    let write_result = taken_stdin.write_all(data.as_bytes()).await;
    let flush_result = if write_result.is_ok() {
        taken_stdin.flush().await
    } else {
        Ok(())
    };

    // Put the stdin back into the ProcessHandle
    {
        let mut procs = state
            .processes
            .lock()
            .map_err(|e| format!("Process registry lock error: {}", e))?;
        if let Some(handle) = procs.get_mut(agent_id) {
            handle.stdin = Some(taken_stdin);
        }
    }

    write_result.map_err(|e| format!("Failed to write to agent stdin: {}", e))?;
    flush_result.map_err(|e| format!("Failed to flush agent stdin: {}", e))?;

    // Reset input-wait tracker: user provided input, agent should resume
    {
        let mut waits = state
            .input_wait
            .lock()
            .map_err(|e| format!("Input wait lock error: {}", e))?;
        if let Some(info) = waits.get_mut(agent_id) {
            info.last_output_at = Instant::now();
            info.notification_sent = false;
            info.might_need_input = false;
            info.last_output_text.clear();
        }
    }

    log::info!("Sent input to agent {}: {}", agent_id, input);
    Ok(())
}

/// Heuristic: does this assistant text look like the agent is asking the human a question?
/// Used to switch to the short silence threshold so the human is notified quickly.
fn looks_like_question(text: &str) -> bool {
    let trimmed = text.trim_end();
    if trimmed.ends_with('?') {
        return true;
    }
    let lower = text.to_lowercase();
    lower.contains("do you want")
        || lower.contains("would you like")
        || lower.contains("should i ")
        || lower.contains("need your input")
        || lower.contains("please confirm")
        || lower.contains("let me know if")
        || lower.contains("how would you like")
        || lower.contains("what would you like")
        || lower.contains("please clarify")
        || lower.contains("need clarification")
}

/// Resume a paused agent with optional additional context injected into prompt_context.
pub async fn resume_agent(
    app_handle: AppHandle,
    state: &AppState,
    agent_id: &str,
    additional_context: Option<String>,
) -> Result<(), String> {
    // Write context to the ephemeral prompt_context column (replaces, never appends)
    if let Some(ref context) = additional_context {
        let db = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
        queries::update_agent_context(&db, agent_id, Some(context))
            .map_err(|e| format!("DB error: {}", e))?;
    }

    // Spawn the agent - it will use --resume if session_id exists
    spawn_agent(app_handle, state, agent_id).await
}

// ─── Health Monitor ──────────────────────────────────────────

/// Background loop that runs every 10 seconds to detect agents whose
/// processes have terminated unexpectedly. When a dead process is found,
/// the agent status is set to "error" and the process handle is removed.
pub async fn health_monitor_loop(app_handle: AppHandle) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
    let state_ref = app_handle.state::<AppState>();

    loop {
        interval.tick().await;
        // Carry (agent_id, session_id) so the session can be preserved across restarts.
        let mut dead_agents: Vec<(String, Option<String>)> = Vec::new();

        // Check each registered process
        {
            let mut procs = match state_ref.processes.lock() {
                Ok(p) => p,
                Err(_) => continue,
            };

            for (agent_id, handle) in procs.iter_mut() {
                match handle.child.try_wait() {
                    Ok(Some(_exit_status)) => {
                        // Process has exited unexpectedly
                        let sid = Some(handle.session_id.clone()).filter(|s| !s.is_empty());
                        dead_agents.push((agent_id.clone(), sid));
                    }
                    Ok(None) => {
                        // Still running, all good
                    }
                    Err(e) => {
                        log::warn!(
                            "Health check: failed to poll agent {} process: {}",
                            agent_id,
                            e
                        );
                        let sid = Some(handle.session_id.clone()).filter(|s| !s.is_empty());
                        dead_agents.push((agent_id.clone(), sid));
                    }
                }
            }

            // Remove dead agents from registry
            for (id, _) in &dead_agents {
                procs.remove(id);
            }
        }

        // Update DB and emit events for dead agents
        if !dead_agents.is_empty() {
            if let Ok(db) = state_ref.db.lock() {
                for (id, session_id) in &dead_agents {
                    log::warn!("Health monitor: agent {} process died unexpectedly", id);
                    let _ = queries::update_agent_status(&db, id, "error");
                    let _ = queries::update_agent_process(&db, id, None, session_id.as_deref());
                    let _ = queries::insert_log(
                        &db,
                        id,
                        "error",
                        "Agent process terminated unexpectedly",
                    );

                    let _ = app_handle.emit(
                        "agent-status-change",
                        AgentStatusPayload {
                            agent_id: id.clone(),
                            status: "error".to_string(),
                            session_id: session_id.clone(),
                        },
                    );

                    let _ = app_handle.emit(
                        "agent-log",
                        AgentLogPayload {
                            agent_id: id.clone(),
                            log_type: "error".to_string(),
                            content: "Agent process terminated unexpectedly".to_string(),
                        },
                    );
                }
            }
        }
    }
}
