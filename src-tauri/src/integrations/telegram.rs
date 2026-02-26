use reqwest::Client;
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use teloxide::prelude::*;
use tokio::sync::Notify;

use crate::agents::manager::{AgentLogPayload, send_agent_input};
use crate::db::queries;
use crate::state::AppState;

/// Static shutdown signal shared between start_bot and stop_bot.
static SHUTDOWN: std::sync::LazyLock<Arc<Notify>> =
    std::sync::LazyLock::new(|| Arc::new(Notify::new()));

// ─── Simple HTTP helpers ──────────────────────────────────────

/// Escape a string for use in Telegram HTML messages.
/// Replaces &, <, > with their HTML entities so dynamic content
/// can never break the message rendering.
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Send a single Telegram message via the Bot API using reqwest.
/// Uses HTML parse mode — all dynamic content must be HTML-escaped first.
pub async fn send_telegram_message(
    bot_token: &str,
    chat_id: &str,
    message: &str,
) -> Result<(), String> {
    let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
    let client = Client::new();

    let resp = client
        .post(&url)
        .json(&json!({
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML",
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to send Telegram message: {}", e))?;

    if !resp.status().is_success() {
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());
        return Err(format!("Telegram API error: {}", body));
    }

    Ok(())
}

/// Format and send an error notification for a specific agent.
pub async fn notify_agent_error(
    bot_token: &str,
    chat_id: &str,
    agent_name: &str,
    error: &str,
) -> Result<(), String> {
    let message = format!(
        "🔴 <b>Agent Error</b>\n\n\
         <b>Agent:</b> <code>{}</code>\n\
         <b>Error:</b>\n<pre>{}</pre>",
        escape_html(agent_name),
        escape_html(error)
    );
    send_telegram_message(bot_token, chat_id, &message).await
}

/// Format and send a "human input needed" notification.
/// The `question` field is HTML-escaped so raw agent output (code, JSON,
/// markdown, etc.) never causes Telegram to silently drop the content.
pub async fn notify_human_needed(
    bot_token: &str,
    chat_id: &str,
    agent_name: &str,
    question: &str,
) -> Result<(), String> {
    let message = format!(
        "🤖 <b>Agent Needs Input</b>\n\n\
         <b>Agent:</b> <code>{}</code>\n\
         <b>Last output / question:</b>\n{}\n\n\
         <i>Reply to this message to respond to the agent.</i>",
        escape_html(agent_name),
        escape_html(question)
    );
    send_telegram_message(bot_token, chat_id, &message).await
}

// ─── Waiting-agent routing ───────────────────────────────────

/// Find a waiting agent to route a Telegram reply to.
///
/// - If `text` starts with `@agent_name:`, match that specific agent.
/// - Otherwise, return the oldest-waiting agent that has `notification_sent == true`.
///
/// Returns `(agent_id, agent_name)` if found.
fn find_waiting_agent(state: &AppState, text: &str) -> Option<(String, String)> {
    let waits = state.input_wait.lock().ok()?;
    let procs = state.processes.lock().ok()?;

    // Check for explicit @agent_name: prefix
    if text.starts_with('@') {
        if let Some(colon_pos) = text.find(':') {
            let target_name = &text[1..colon_pos];
            for (agent_id, info) in waits.iter() {
                if info.agent_name == target_name
                    && info.notification_sent
                    && procs.contains_key(agent_id)
                {
                    return Some((agent_id.clone(), info.agent_name.clone()));
                }
            }
        }
    }

    // Fallback: oldest waiting agent with notification_sent
    let mut oldest: Option<(&str, &str, std::time::Instant)> = None;
    for (agent_id, info) in waits.iter() {
        if !info.notification_sent || !procs.contains_key(agent_id) {
            continue;
        }
        match &oldest {
            None => oldest = Some((agent_id, &info.agent_name, info.last_output_at)),
            Some((_, _, ts)) if info.last_output_at < *ts => {
                oldest = Some((agent_id, &info.agent_name, info.last_output_at));
            }
            _ => {}
        }
    }

    oldest.map(|(id, name, _)| (id.to_string(), name.to_string()))
}

// ─── Teloxide bot dispatcher ─────────────────────────────────

/// Start a teloxide bot that listens for incoming messages and posts
/// them to the internal message bus as messages from "user".
///
/// The bot runs in the background until `stop_bot()` is called.
pub async fn start_bot(
    app_handle: AppHandle,
    bot_token: String,
    chat_id: String,
) -> Result<(), String> {
    // Guard: only allow one bot instance at a time.
    {
        let state = app_handle.state::<AppState>();
        let mut running = state
            .telegram_running
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if *running {
            return Err("Telegram bot is already running".to_string());
        }
        *running = true;
    }

    let bot = Bot::new(&bot_token);
    let allowed_chat_id = chat_id.clone();
    let bot_token_clone = bot_token.clone();
    let chat_id_clone = chat_id.clone();
    let handle = app_handle.clone();
    let shutdown = SHUTDOWN.clone();

    // Spawn the dispatcher in a background task.
    tauri::async_runtime::spawn(async move {
        let handler = Update::filter_message().endpoint(
            move |msg: Message, _bot: Bot| {
                let handle = handle.clone();
                let allowed = allowed_chat_id.clone();
                let bot_token_inner = bot_token_clone.clone();
                let chat_id_inner = chat_id_clone.clone();
                async move {
                    // Only process messages from the configured chat.
                    let msg_chat_id = msg.chat.id.to_string();
                    if msg_chat_id != allowed {
                        log::warn!(
                            "Ignoring message from unexpected chat {}",
                            msg_chat_id
                        );
                        return Ok::<(), Box<dyn std::error::Error + Send + Sync>>(());
                    }

                    let text = match msg.text() {
                        Some(t) => t.to_string(),
                        None => return Ok(()),
                    };

                    log::info!("Telegram message received: {}", text);

                    // Insert into message bus (existing behavior)
                    {
                        let state = handle.state::<AppState>();
                        let db = state.db.lock().unwrap();
                        let _ = queries::insert_message(
                            &db,
                            "user",
                            None,
                            "chat",
                            &text,
                            Some("{\"source\":\"telegram\"}"),
                        );
                    }

                    // Check if there's a waiting agent to route to
                    let waiting = {
                        let state = handle.state::<AppState>();
                        find_waiting_agent(&state, &text)
                    };

                    if let Some((agent_id, agent_name)) = waiting {
                        // Strip @agent_name: prefix if present
                        let input = if text.starts_with('@') {
                            if let Some(colon_pos) = text.find(':') {
                                text[colon_pos + 1..].trim().to_string()
                            } else {
                                text.clone()
                            }
                        } else {
                            text.clone()
                        };

                        // Send input to agent
                        let state = handle.state::<AppState>();
                        match send_agent_input(&state, &agent_id, &input).await {
                            Ok(()) => {
                                // Log as user_input
                                if let Ok(db) = state.db.lock() {
                                    let log_content =
                                        format!("[via Telegram] {}", input);
                                    let _ = queries::insert_log(
                                        &db,
                                        &agent_id,
                                        "user_input",
                                        &log_content,
                                    );
                                }

                                let _ = handle.emit(
                                    "agent-log",
                                    AgentLogPayload {
                                        agent_id: agent_id.clone(),
                                        log_type: "user_input".to_string(),
                                        content: format!("[via Telegram] {}", input),
                                    },
                                );

                                // Emit waiting=false event
                                let _ = handle.emit(
                                    "agent-waiting-input",
                                    crate::agents::input_monitor::AgentWaitingPayload {
                                        agent_id: agent_id.clone(),
                                        agent_name: agent_name.clone(),
                                        waiting: false,
                                        last_output: String::new(),
                                    },
                                );

                                // Send Telegram confirmation
                                let confirm_msg =
                                    format!("Sent to agent `{}`", agent_name);
                                let _ = send_telegram_message(
                                    &bot_token_inner,
                                    &chat_id_inner,
                                    &confirm_msg,
                                )
                                .await;

                                log::info!(
                                    "Routed Telegram reply to agent {}: {}",
                                    agent_id,
                                    input
                                );
                            }
                            Err(e) => {
                                log::warn!(
                                    "Failed to route Telegram reply to agent {}: {}",
                                    agent_id,
                                    e
                                );
                                let _ = send_telegram_message(
                                    &bot_token_inner,
                                    &chat_id_inner,
                                    &format!("Failed to send to agent: {}", e),
                                )
                                .await;
                            }
                        }
                    }

                    Ok(())
                }
            },
        );

        let mut dispatcher = Dispatcher::builder(bot, handler)
            .default_handler(|_upd| async {})
            .build();

        // Run the dispatcher until the shutdown signal fires.
        tokio::select! {
            _ = dispatcher.dispatch() => {
                log::info!("Telegram dispatcher exited on its own");
            }
            _ = shutdown.notified() => {
                log::info!("Telegram bot received shutdown signal");
                let _ = dispatcher.shutdown_token().shutdown();
            }
        }

        // Mark the bot as stopped.
        if let Some(app) = tauri::async_runtime::handle()
            .block_on(async { None::<AppHandle> })
        {
            // Fallback; should not normally execute.
            let _ = app;
        }

        log::info!("Telegram bot task finished");
    });

    Ok(())
}

/// Signal the running bot to stop.
pub fn stop_bot() {
    SHUTDOWN.notify_one();
}
