use crate::db::queries;
use crate::orchestrator::message_bus;
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct PostMessageRequest {
    pub from_agent: String,
    pub to_agent: Option<String>,
    pub message_type: String,
    pub content: String,
    pub metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GetMessagesRequest {
    pub agent_id: Option<String>,
    pub message_type: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct AddKnowledgeRequest {
    pub agent_id: String,
    pub category: String,
    pub title: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub fn post_message(
    state: State<'_, AppState>,
    request: PostMessageRequest,
) -> Result<i64, String> {
    message_bus::post_message(
        &state.db,
        &request.from_agent,
        request.to_agent.as_deref(),
        &request.message_type,
        &request.content,
        request.metadata.as_deref(),
    )
}

#[tauri::command]
pub fn get_messages(
    state: State<'_, AppState>,
    request: GetMessagesRequest,
) -> Result<Vec<queries::Message>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_messages(
        &db,
        request.agent_id.as_deref(),
        request.message_type.as_deref(),
        request.limit.unwrap_or(50),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_knowledge(
    state: State<'_, AppState>,
    category: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<queries::Knowledge>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(query) = search {
        queries::search_knowledge(&db, &query, limit.unwrap_or(20)).map_err(|e| e.to_string())
    } else {
        queries::get_knowledge(&db, category.as_deref(), limit.unwrap_or(50))
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn add_knowledge(
    state: State<'_, AppState>,
    request: AddKnowledgeRequest,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let tags = serde_json::to_string(&request.tags.unwrap_or_default())
        .unwrap_or_else(|_| "[]".to_string());
    queries::insert_knowledge(&db, &request.agent_id, &request.category, &request.title, &request.content, &tags)
        .map_err(|e| e.to_string())
}
