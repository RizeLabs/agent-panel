use crate::db::queries;
use crate::integrations::telegram;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn test_telegram(state: State<'_, AppState>) -> Result<String, String> {
    let (token, chat_id) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let token = queries::get_setting(&db, "telegram_bot_token")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Telegram bot token not configured".to_string())?;
        let chat_id = queries::get_setting(&db, "telegram_chat_id")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Telegram chat ID not configured".to_string())?;
        (token, chat_id)
    };

    telegram::send_telegram_message(&token, &chat_id, "Agent Panel test message - connection successful!")
        .await?;
    Ok("Test message sent successfully".to_string())
}

#[tauri::command]
pub async fn start_telegram_bot(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (token, chat_id) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let token = queries::get_setting(&db, "telegram_bot_token")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Telegram bot token not configured".to_string())?;
        let chat_id = queries::get_setting(&db, "telegram_chat_id")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Telegram chat ID not configured".to_string())?;
        (token, chat_id)
    };

    {
        let mut running = state.telegram_running.lock().map_err(|e| e.to_string())?;
        if *running {
            return Err("Telegram bot already running".to_string());
        }
        *running = true;
    }

    telegram::start_bot(app_handle, token, chat_id).await
}

#[tauri::command]
pub fn stop_telegram_bot(state: State<'_, AppState>) -> Result<(), String> {
    let mut running = state.telegram_running.lock().map_err(|e| e.to_string())?;
    *running = false;
    Ok(())
}
