use chrono::Utc;
use tauri::{AppHandle, Manager};
use tokio::time::Duration;

use crate::agents::manager;
use crate::db::queries;
use crate::orchestrator::message_bus;
use crate::state::AppState;

const CRON_POLL_SECS: u64 = 30;

/// Global 30-second polling loop launched at app startup.
/// Picks up agent-requested schedule_request messages and fires due cron jobs.
pub async fn cron_runner_loop(app_handle: AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_secs(CRON_POLL_SECS)).await;
        let state = app_handle.state::<AppState>();

        // 1. Consume schedule_request messages posted by agents
        process_schedule_requests(&state);

        // 2. Collect due jobs (release lock before firing)
        let due = {
            let conn = match state.db.lock() {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Cron runner DB lock error: {}", e);
                    continue;
                }
            };
            queries::get_due_cron_jobs(&conn).unwrap_or_default()
        };

        // 3. Fire each due job and advance its schedule
        for job in due {
            fire_job(&app_handle, &state, &job).await;

            let now = Utc::now();
            let next = now + chrono::Duration::seconds(job.interval_secs);
            if let Ok(conn) = state.db.lock() {
                let _ = queries::record_cron_run(
                    &conn,
                    &job.id,
                    &now.format("%Y-%m-%d %H:%M:%S").to_string(),
                    &next.format("%Y-%m-%d %H:%M:%S").to_string(),
                );
            }
        }
    }
}

/// Read unprocessed `schedule_request` messages from the message bus,
/// parse their JSON payload, and register new cron jobs for each.
fn process_schedule_requests(state: &AppState) {
    let conn = match state.db.lock() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Cron: failed to lock DB for schedule requests: {}", e);
            return;
        }
    };

    // Collect rows first so the prepared statement is dropped before we mutate.
    // Use `let x = match ...; x` pattern to force the MappedRows temporary to
    // be dropped (borrow released) before `stmt` is dropped at end of block.
    let rows: Vec<(i64, String, String)> = {
        let mut stmt = match conn.prepare(
            "SELECT id, from_agent, content FROM messages
             WHERE message_type = 'schedule_request'
               AND read_by NOT LIKE '%\"scheduler\"%'",
        ) {
            Ok(s) => s,
            Err(e) => {
                log::error!("Cron: failed to prepare schedule_request query: {}", e);
                return;
            }
        };

        let x = match stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        }) {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect::<Vec<_>>(),
            Err(e) => {
                log::error!("Cron: failed to query schedule_request messages: {}", e);
                return;
            }
        };
        x
    };

    for (msg_id, from_agent, content) in rows {
        match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(payload) => {
                let name = payload["name"]
                    .as_str()
                    .unwrap_or("Agent Job")
                    .to_string();
                let interval_secs = payload["interval_secs"].as_i64().unwrap_or(3600);
                let action_type = payload["action_type"]
                    .as_str()
                    .unwrap_or("post_message")
                    .to_string();
                let job_payload = payload["payload"].as_str().unwrap_or("").to_string();
                let description = payload["description"].as_str().map(String::from);

                let now = Utc::now();
                let next = now + chrono::Duration::seconds(interval_secs);

                let job = queries::CronJob {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: name.clone(),
                    description,
                    interval_secs,
                    agent_id: from_agent.clone(),
                    action_type,
                    payload: job_payload,
                    enabled: true,
                    last_run_at: None,
                    next_run_at: next.format("%Y-%m-%d %H:%M:%S").to_string(),
                    run_count: 0,
                    created_by: from_agent,
                    created_at: now.format("%Y-%m-%d %H:%M:%S").to_string(),
                };

                if let Err(e) = queries::insert_cron_job(&conn, &job) {
                    log::error!("Cron: failed to insert scheduled job '{}': {}", name, e);
                } else {
                    log::info!("Cron: registered agent-requested job '{}'", name);
                }
            }
            Err(e) => {
                log::warn!(
                    "Cron: invalid schedule_request payload for message {}: {}",
                    msg_id,
                    e
                );
            }
        }

        // Mark message as read by "scheduler" regardless of parse success
        let _ = conn.execute(
            "UPDATE messages SET read_by = json_insert(read_by, '$[#]', ?1) WHERE id = ?2",
            rusqlite::params!["scheduler", msg_id],
        );
    }
}

/// Fire a single cron job.
///
/// For `post_message`: posts to the agent's inbox; breathe loop delivers within ≤60 s.
/// For `inject_context`: injects context, stops, then restarts the agent immediately.
///
/// Note: does NOT call `record_cron_run`. The caller (cron_runner_loop) does that
/// for scheduled fires. Manual triggers via IPC skip `record_cron_run` intentionally.
pub async fn fire_job(app_handle: &AppHandle, state: &AppState, job: &queries::CronJob) {
    log::info!("Cron: firing job '{}' ({})", job.name, job.id);

    match job.action_type.as_str() {
        "post_message" => {
            if let Err(e) = message_bus::post_message(
                &state.db,
                "scheduler",
                Some(&job.agent_id),
                "cron_trigger",
                &job.payload,
                None,
            ) {
                log::error!("Cron: post_message failed for job {}: {}", job.id, e);
            }
        }
        "inject_context" => {
            let context = format!("\n[CRON TRIGGER: {}]\n{}", job.name, job.payload);
            if let Err(e) = inject_context_into_agent(state, &job.agent_id, &context) {
                log::error!(
                    "Cron: inject_context failed for agent {}: {}",
                    job.agent_id,
                    e
                );
                return;
            }
            let _ = manager::stop_agent(state, &job.agent_id);
            if let Err(e) = manager::spawn_agent(app_handle.clone(), state, &job.agent_id).await {
                log::error!(
                    "Cron: failed to restart agent {}: {}",
                    job.agent_id,
                    e
                );
            }
        }
        _ => log::warn!(
            "Cron: unknown action_type '{}' for job {}",
            job.action_type,
            job.id
        ),
    }
}

/// Append context text to an agent's system prompt so the next spawn sees it.
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
