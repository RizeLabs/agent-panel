use crate::agents::output_parser::{self, StreamEvent};
use crate::db::queries;
use crate::state::{AppState, ProcessHandle};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use std::process::Stdio;

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

    // Prevent double-start
    if agent.status == "running" {
        return Err(format!("Agent {} is already running", agent_id));
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

    // ── 7. Spawn stdout reader task ──────────────────────────
    let agent_id_owned = agent_id.to_string();
    let handle_clone = app_handle.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(event) = output_parser::parse_stream_line(&line) {
                handle_stream_event(&handle_clone, &agent_id_owned, &event);
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
            {
                let mut procs = state_exit.processes.lock().unwrap();
                procs.remove(&agent_id_owned);
            }
            {
                let db = state_exit.db.lock().unwrap();
                let _ = queries::update_agent_status(&db, &agent_id_owned, "stopped");
                let _ = queries::update_agent_process(&db, &agent_id_owned, None, None);
            }
            let _ = handle_clone.emit(
                "agent-status-change",
                AgentStatusPayload {
                    agent_id: agent_id_owned.clone(),
                    status: "stopped".to_string(),
                    session_id: None,
                },
            );
            log::info!("Agent {} process exited, marked as stopped", agent_id_owned);
        }
    });

    Ok(())
}

/// Helper: add `-p "<system_prompt>"` to the command when not resuming.
fn add_prompt_args(cmd: &mut Command, agent: &queries::Agent) {
    if let Some(ref prompt) = agent.system_prompt {
        if !prompt.is_empty() {
            cmd.arg("-p").arg(prompt);
        }
    }
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
    // Remove from process registry and kill
    let mut handle = {
        let mut procs = state
            .processes
            .lock()
            .map_err(|e| format!("Process registry lock error: {}", e))?;
        procs
            .remove(agent_id)
            .ok_or_else(|| format!("No running process found for agent: {}", agent_id))?
    };

    // Send kill signal (sync version)
    handle
        .child
        .start_kill()
        .map_err(|e| format!("Failed to kill process for agent {}: {}", agent_id, e))?;

    // Update DB
    {
        let db = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
        queries::update_agent_status(&db, agent_id, "stopped")
            .map_err(|e| format!("DB error: {}", e))?;
        queries::update_agent_process(&db, agent_id, None, Some(&handle.session_id))
            .map_err(|e| format!("DB error: {}", e))?;
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

    log::info!("Sent input to agent {}: {}", agent_id, input);
    Ok(())
}

/// Resume a paused agent with optional additional context injected into the prompt.
pub async fn resume_agent(
    app_handle: AppHandle,
    state: &AppState,
    agent_id: &str,
    additional_context: Option<String>,
) -> Result<(), String> {
    // Optionally inject additional context into the agent's system prompt
    if let Some(ref context) = additional_context {
        let db = state.db.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let agent = queries::get_agent_by_id(&db, agent_id)
            .map_err(|e| format!("DB error: {}", e))?
            .ok_or_else(|| format!("Agent not found: {}", agent_id))?;
        let current_prompt = agent.system_prompt.clone().unwrap_or_default();
        let updated_prompt = format!("{}\n\n{}", current_prompt, context);
        let mut updated_agent = agent;
        updated_agent.system_prompt = Some(updated_prompt);
        queries::update_agent(&db, &updated_agent).map_err(|e| format!("DB error: {}", e))?;
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
        let mut dead_agents: Vec<String> = Vec::new();

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
                        dead_agents.push(agent_id.clone());
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
                        dead_agents.push(agent_id.clone());
                    }
                }
            }

            // Remove dead agents from registry
            for id in &dead_agents {
                procs.remove(id);
            }
        }

        // Update DB and emit events for dead agents
        if !dead_agents.is_empty() {
            if let Ok(db) = state_ref.db.lock() {
                for id in &dead_agents {
                    log::warn!("Health monitor: agent {} process died unexpectedly", id);
                    let _ = queries::update_agent_status(&db, id, "error");
                    let _ = queries::update_agent_process(&db, id, None, None);
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
                            session_id: None,
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
