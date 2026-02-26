use tauri::{AppHandle, Manager};

use crate::agents::manager;
use crate::commands::swarm_commands::SwarmAgentConfig;
use crate::db::queries::{self, Swarm};
use crate::orchestrator::coordinator;
use crate::orchestrator::message_bus;
use crate::state::AppState;

/// Default breathe-loop interval in seconds.
const DEFAULT_BREATHE_INTERVAL_SECS: u64 = 60;

/// Create a new swarm in the database.
///
/// This will:
/// 1. Create a coordinator agent for the swarm.
/// 2. Persist the swarm record with the coordinator linked.
///
/// Returns the swarm ID.
pub fn create_swarm(
    state: &AppState,
    name: &str,
    agent_configs: Vec<SwarmAgentConfig>,
    goal: Option<String>,
) -> Result<String, String> {
    // Apply per-agent prompt and skills overrides before creating the swarm
    {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;

        for config in &agent_configs {
            if config.system_prompt.is_none() && config.skills.is_none() {
                continue;
            }

            let mut agent = queries::get_agent_by_id(&conn, &config.agent_id)
                .map_err(|e| format!("Failed to get agent {}: {}", config.agent_id, e))?
                .ok_or_else(|| format!("Agent '{}' not found", config.agent_id))?;

            if let Some(ref prompt) = config.system_prompt {
                agent.system_prompt = Some(prompt.clone());
            }
            if let Some(ref skills) = config.skills {
                agent.skills = serde_json::to_string(skills)
                    .map_err(|e| format!("Failed to serialize skills: {}", e))?;
            }

            queries::update_agent(&conn, &agent)
                .map_err(|e| format!("Failed to update agent {}: {}", config.agent_id, e))?;

            log::info!("Updated agent '{}' config for swarm '{}'", config.agent_id, name);
        }
    }

    // Extract agent IDs from configs
    let agent_ids: Vec<String> = agent_configs.iter().map(|c| c.agent_id.clone()).collect();

    // Create the coordinator agent first
    let coordinator_id = coordinator::create_coordinator_agent(state, name, goal.as_deref())?;

    let swarm_id = uuid::Uuid::new_v4().to_string();
    let agent_ids_json =
        serde_json::to_string(&agent_ids).map_err(|e| format!("JSON serialize error: {}", e))?;

    let swarm = Swarm {
        id: swarm_id.clone(),
        name: name.to_string(),
        goal,
        agent_ids: agent_ids_json,
        coordinator_id: Some(coordinator_id),
        status: "stopped".to_string(),
        created_at: String::new(), // DB will set CURRENT_TIMESTAMP
    };

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_swarm(&conn, &swarm)
        .map_err(|e| format!("Failed to insert swarm: {}", e))?;

    log::info!("Created swarm '{}' with id {}", name, swarm_id);
    Ok(swarm_id)
}

/// Start a swarm: launch only the coordinator agent, then kick off the
/// asynchronous breathe loop and coordinator loop.  Member agents are spawned
/// on-demand by the coordinator when it assigns tasks.
pub async fn start_swarm(
    app_handle: AppHandle,
    state: &AppState,
    swarm_id: &str,
) -> Result<(), String> {
    // Fetch swarm record
    let swarm = {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        queries::get_swarm(&conn, swarm_id)
            .map_err(|e| format!("Failed to get swarm: {}", e))?
            .ok_or_else(|| format!("Swarm '{}' not found", swarm_id))?
    };

    // Start the coordinator agent — it will delegate tasks to member agents
    if let Some(ref coord_id) = swarm.coordinator_id {
        if let Err(e) = manager::spawn_agent(app_handle.clone(), state, coord_id).await {
            log::error!("Failed to start coordinator {} in swarm: {}", coord_id, e);
        }
    }

    // Mark swarm as running
    {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        queries::update_swarm_status(&conn, swarm_id, "running")
            .map_err(|e| format!("Failed to update swarm status: {}", e))?;
    }

    // Spawn the breathe loop as a background tokio task
    let bh_app_handle = app_handle.clone();
    let bh_swarm_id = swarm_id.to_string();
    tokio::spawn(async move {
        breathe_loop(bh_app_handle, &bh_swarm_id).await;
    });

    // Spawn the coordinator loop as a separate background task
    if let Some(coord_id) = swarm.coordinator_id {
        let cl_app_handle = app_handle.clone();
        let cl_swarm_id = swarm_id.to_string();
        tokio::spawn(async move {
            coordinator::coordinator_loop(cl_app_handle, &coord_id, &cl_swarm_id).await;
        });
    }

    log::info!("Swarm {} started", swarm_id);
    Ok(())
}

/// Stop a swarm: halt all member agents and the coordinator, then update the
/// swarm status so that any running breathe/coordinator loops will terminate.
pub fn stop_swarm(state: &AppState, swarm_id: &str) -> Result<(), String> {
    let swarm = {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        queries::get_swarm(&conn, swarm_id)
            .map_err(|e| format!("Failed to get swarm: {}", e))?
            .ok_or_else(|| format!("Swarm '{}' not found", swarm_id))?
    };

    let agent_ids: Vec<String> = serde_json::from_str(&swarm.agent_ids)
        .map_err(|e| format!("Failed to parse agent_ids: {}", e))?;

    // Stop member agents
    for agent_id in &agent_ids {
        if let Err(e) = manager::stop_agent(state, agent_id) {
            log::error!("Failed to stop agent {} in swarm: {}", agent_id, e);
        }
    }

    // Stop coordinator
    if let Some(ref coord_id) = swarm.coordinator_id {
        if let Err(e) = manager::stop_agent(state, coord_id) {
            log::error!("Failed to stop coordinator {} in swarm: {}", coord_id, e);
        }
    }

    // Mark swarm as stopped -- this will cause the breathe loop to exit
    {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        queries::update_swarm_status(&conn, swarm_id, "stopped")
            .map_err(|e| format!("Failed to update swarm status: {}", e))?;
    }

    log::info!("Swarm {} stopped", swarm_id);
    Ok(())
}

/// Asynchronous breathe loop for a swarm.
///
/// On each tick the loop:
/// 1. Checks if the swarm is still running (exits if stopped).
/// 2. For every member agent, looks for pending (unread) messages.
/// 3. If messages exist, stops the agent, builds a context injection from
///    those messages, and restarts the agent so it resumes with the new context.
///
/// The loop is spawned as a tokio task by `start_swarm` and will run until the
/// swarm status is changed to `"stopped"`.
pub async fn breathe_loop(app_handle: AppHandle, swarm_id: &str) {
    let interval = std::time::Duration::from_secs(DEFAULT_BREATHE_INTERVAL_SECS);
    let state = app_handle.state::<AppState>();

    loop {
        tokio::time::sleep(interval).await;

        // Check if swarm is still running
        let swarm = {
            let conn = match state.db.lock() {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Breathe loop DB lock error: {}", e);
                    continue;
                }
            };
            match queries::get_swarm(&conn, swarm_id) {
                Ok(Some(s)) => s,
                Ok(None) => {
                    log::warn!("Swarm {} no longer exists, exiting breathe loop", swarm_id);
                    return;
                }
                Err(e) => {
                    log::error!("Breathe loop: failed to get swarm: {}", e);
                    continue;
                }
            }
        };

        if swarm.status != "running" {
            log::info!(
                "Swarm {} status is '{}', exiting breathe loop",
                swarm_id,
                swarm.status
            );
            return;
        }

        // Parse agent IDs
        let agent_ids: Vec<String> = match serde_json::from_str(&swarm.agent_ids) {
            Ok(ids) => ids,
            Err(e) => {
                log::error!("Breathe loop: failed to parse agent_ids: {}", e);
                continue;
            }
        };

        // For each agent, check for pending messages and perform the
        // stop -> inject context -> restart cycle if needed.
        for agent_id in &agent_ids {
            let pending = match message_bus::get_pending_messages(&state.db, agent_id) {
                Ok(msgs) => msgs,
                Err(e) => {
                    log::error!(
                        "Breathe loop: failed to get pending messages for {}: {}",
                        agent_id,
                        e
                    );
                    continue;
                }
            };

            if pending.is_empty() {
                continue;
            }

            log::info!(
                "Breathe loop: agent {} has {} pending messages, cycling",
                agent_id,
                pending.len()
            );

            // Build the context injection string
            let context = message_bus::build_context_injection(&pending);

            // Mark messages as read before restarting
            let msg_ids: Vec<i64> = pending.iter().map(|m| m.id).collect();
            if let Err(e) = message_bus::mark_read(&state.db, &msg_ids, agent_id) {
                log::error!(
                    "Breathe loop: failed to mark messages read for {}: {}",
                    agent_id,
                    e
                );
            }

            // Append context to the agent's system prompt so the resumed session
            // sees the new messages.
            if let Err(e) = inject_context_into_agent(&state, agent_id, &context) {
                log::error!(
                    "Breathe loop: failed to inject context for {}: {}",
                    agent_id,
                    e
                );
                continue;
            }

            // Stop the agent
            if let Err(e) = manager::stop_agent(&state, agent_id) {
                log::error!("Breathe loop: failed to stop agent {}: {}", agent_id, e);
                continue;
            }

            // Restart with --resume so the agent picks up from where it left off
            // plus the newly injected context.
            if let Err(e) = manager::spawn_agent(app_handle.clone(), &state, agent_id).await {
                log::error!("Breathe loop: failed to restart agent {}: {}", agent_id, e);
            }
        }
    }
}

/// Append context text to an agent's system prompt in the database so that when
/// it is next started/resumed it will see the injected messages.
fn inject_context_into_agent(
    state: &AppState,
    agent_id: &str,
    context: &str,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let agent = queries::get_agent_by_id(&conn, agent_id)
        .map_err(|e| format!("Failed to get agent: {}", e))?
        .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;

    let current_prompt = agent.system_prompt.clone().unwrap_or_default();
    let updated_prompt = format!("{}\n{}", current_prompt, context);

    let mut updated_agent = agent;
    updated_agent.system_prompt = Some(updated_prompt);

    queries::update_agent(&conn, &updated_agent)
        .map_err(|e| format!("Failed to update agent prompt: {}", e))?;

    Ok(())
}
