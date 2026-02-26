use crate::agents::manager::AgentLogPayload;
use crate::db::queries;
use crate::integrations::telegram;
use crate::state::AppState;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use std::time::{Duration, Instant};

/// Threshold after which a running agent is considered "waiting for input".
const SILENCE_THRESHOLD: Duration = Duration::from_secs(30);

/// How often the monitor loop ticks.
const CHECK_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize)]
pub struct AgentWaitingPayload {
    pub agent_id: String,
    pub agent_name: String,
    pub waiting: bool,
    pub last_output: String,
}

/// Background loop that detects agents that have gone silent for too long
/// while still running. Sends a Telegram notification and emits a frontend event.
pub async fn input_wait_monitor_loop(app_handle: AppHandle) {
    let mut interval = tokio::time::interval(CHECK_INTERVAL);

    loop {
        interval.tick().await;

        let state = app_handle.state::<AppState>();
        let now = Instant::now();

        // Collect agents that need notification (mutex scoped)
        let agents_to_notify: Vec<(String, String, String)> = {
            let mut waits = match state.input_wait.lock() {
                Ok(w) => w,
                Err(_) => continue,
            };
            let procs = match state.processes.lock() {
                Ok(p) => p,
                Err(_) => continue,
            };

            let mut to_notify = Vec::new();

            for (agent_id, info) in waits.iter_mut() {
                if info.notification_sent {
                    continue;
                }
                if now.duration_since(info.last_output_at) < SILENCE_THRESHOLD {
                    continue;
                }
                if !procs.contains_key(agent_id) {
                    continue;
                }

                info.notification_sent = true;
                let last_text = if info.last_output_text.len() > 500 {
                    format!("{}…", &info.last_output_text[..500])
                } else {
                    info.last_output_text.clone()
                };
                to_notify.push((
                    agent_id.clone(),
                    info.agent_name.clone(),
                    last_text,
                ));
            }

            to_notify
        }; // locks dropped

        for (agent_id, agent_name, last_output) in agents_to_notify {
            // Emit frontend event
            let _ = app_handle.emit(
                "agent-waiting-input",
                AgentWaitingPayload {
                    agent_id: agent_id.clone(),
                    agent_name: agent_name.clone(),
                    waiting: true,
                    last_output: last_output.clone(),
                },
            );

            // Insert system log
            {
                let db = match state.db.lock() {
                    Ok(db) => db,
                    Err(_) => continue,
                };
                let _ = queries::insert_log(
                    &db,
                    &agent_id,
                    "system",
                    "Agent appears to be waiting for input",
                );
            }

            let _ = app_handle.emit(
                "agent-log",
                AgentLogPayload {
                    agent_id: agent_id.clone(),
                    log_type: "system".to_string(),
                    content: "Agent appears to be waiting for input".to_string(),
                },
            );

            // Send Telegram notification (read creds from DB)
            let (bot_token, chat_id) = {
                let db = match state.db.lock() {
                    Ok(db) => db,
                    Err(_) => continue,
                };
                let token = queries::get_setting(&db, "telegram_bot_token")
                    .ok()
                    .flatten();
                let chat = queries::get_setting(&db, "telegram_chat_id")
                    .ok()
                    .flatten();
                (token, chat)
            };

            if let (Some(token), Some(chat)) = (bot_token, chat_id) {
                if let Err(e) =
                    telegram::notify_human_needed(&token, &chat, &agent_name, &last_output).await
                {
                    log::warn!("Failed to send Telegram input-wait notification: {}", e);
                }
            } else {
                log::debug!(
                    "Telegram not configured, skipping input-wait notification for {}",
                    agent_id
                );
            }
        }
    }
}
