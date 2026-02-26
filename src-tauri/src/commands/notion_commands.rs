use crate::db::queries;
use crate::integrations::notion;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn sync_notion(state: State<'_, AppState>) -> Result<Vec<queries::Task>, String> {
    let (api_key, database_id) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let api_key = queries::get_setting(&db, "notion_api_key")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Notion API key not configured".to_string())?;
        let database_id = queries::get_setting(&db, "notion_database_id")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Notion database ID not configured".to_string())?;
        (api_key, database_id)
    };

    notion::sync_tasks(&state.db, &api_key, &database_id).await
}

#[tauri::command]
pub fn get_tasks(
    state: State<'_, AppState>,
    status: Option<String>,
    assigned_agent: Option<String>,
) -> Result<Vec<queries::Task>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_tasks(&db, status.as_deref(), assigned_agent.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task(state: State<'_, AppState>, task: queries::Task) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_task(&db, &task).map_err(|e| e.to_string())
}
