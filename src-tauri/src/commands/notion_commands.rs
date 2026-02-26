use crate::db::queries;
use crate::integrations::notion;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

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

#[tauri::command]
pub fn create_task(
    state: State<'_, AppState>,
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_agent: Option<String>,
    swarm_id: Option<String>,
) -> Result<queries::Task, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let task = queries::Task {
        id: Uuid::new_v4().to_string(),
        notion_page_id: None,
        title,
        description,
        status: status.unwrap_or_else(|| "todo".to_string()),
        assigned_agent,
        swarm_id,
        priority: priority.unwrap_or_else(|| "medium".to_string()),
        parent_task_id: None,
        blocked_by: String::new(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    queries::insert_task(&db, &task).map_err(|e| e.to_string())?;
    // Re-fetch to get DB-generated timestamps
    queries::get_tasks(&db, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|t| t.id == task.id)
        .ok_or_else(|| "Task created but not found".to_string())
}

#[tauri::command]
pub fn get_swarms(state: State<'_, AppState>) -> Result<Vec<queries::Swarm>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_swarms(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_task(&db, &task_id).map_err(|e| e.to_string())
}
