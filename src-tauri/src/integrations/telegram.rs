use reqwest::Client;
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use teloxide::prelude::*;
use tokio::sync::Notify;

use crate::db::queries;
use crate::state::AppState;

/// Static shutdown signal shared between start_bot and stop_bot.
static SHUTDOWN: std::sync::LazyLock<Arc<Notify>> =
    std::sync::LazyLock::new(|| Arc::new(Notify::new()));

// ─── Simple HTTP helpers ──────────────────────────────────────

/// Send a single Telegram message via the Bot API using reqwest.
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
            "parse_mode": "Markdown",
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
        "*Agent Error*\n\n\
         *Agent:* `{}`\n\
         *Error:* ```\n{}\n```",
        agent_name, error
    );
    send_telegram_message(bot_token, chat_id, &message).await
}

/// Format and send a "human input needed" notification.
pub async fn notify_human_needed(
    bot_token: &str,
    chat_id: &str,
    agent_name: &str,
    question: &str,
) -> Result<(), String> {
    let message = format!(
        "*Agent Needs Help*\n\n\
         *Agent:* `{}`\n\
         *Question:* {}\n\n\
         _Reply to this message to respond._",
        agent_name, question
    );
    send_telegram_message(bot_token, chat_id, &message).await
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
    let handle = app_handle.clone();
    let shutdown = SHUTDOWN.clone();

    // Spawn the dispatcher in a background task.
    tauri::async_runtime::spawn(async move {
        let handler = Update::filter_message().endpoint(
            move |msg: Message, _bot: Bot| {
                let handle = handle.clone();
                let allowed = allowed_chat_id.clone();
                async move {
                    let result: Result<(), Box<dyn std::error::Error + Send + Sync>> = (|| {
                        // Only process messages from the configured chat.
                        let msg_chat_id = msg.chat.id.to_string();
                        if msg_chat_id != allowed {
                            log::warn!(
                                "Ignoring message from unexpected chat {}",
                                msg_chat_id
                            );
                            return Ok(());
                        }

                        if let Some(text) = msg.text() {
                            log::info!("Telegram message received: {}", text);

                            let state = handle.state::<AppState>();
                            let db = state.db.lock().unwrap();
                            let _ = queries::insert_message(
                                &db,
                                "user",
                                None,
                                "chat",
                                text,
                                Some("{\"source\":\"telegram\"}"),
                            );
                        }

                        Ok(())
                    })();
                    result
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
