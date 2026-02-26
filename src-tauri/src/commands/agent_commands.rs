use crate::agents::manager;
use crate::db::queries;
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct CreateAgentRequest {
    pub name: String,
    pub role: String,
    pub system_prompt: Option<String>,
    pub working_directory: Option<String>,
    pub model: Option<String>,
    pub max_turns: Option<i64>,
    pub skills: Option<Vec<String>>,
    pub env_vars: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentRequest {
    pub id: String,
    pub name: String,
    pub role: String,
    pub system_prompt: Option<String>,
    pub working_directory: Option<String>,
    pub model: Option<String>,
    pub max_turns: Option<i64>,
    pub skills: Option<Vec<String>>,
    pub env_vars: Option<serde_json::Value>,
}

#[tauri::command]
pub fn create_agent(
    state: State<'_, AppState>,
    request: CreateAgentRequest,
) -> Result<queries::Agent, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let agent = queries::Agent {
        id: id.clone(),
        name: request.name,
        role: request.role,
        system_prompt: request.system_prompt,
        working_directory: request.working_directory,
        model: request.model.unwrap_or_else(|| "sonnet".to_string()),
        max_turns: request.max_turns.unwrap_or(25),
        skills: serde_json::to_string(&request.skills.unwrap_or_default())
            .unwrap_or_else(|_| "[]".to_string()),
        env_vars: request
            .env_vars
            .map(|v| v.to_string())
            .unwrap_or_else(|| "{}".to_string()),
        status: "idle".to_string(),
        pid: None,
        session_id: None,
        created_at: String::new(),
        updated_at: String::new(),
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::insert_agent(&db, &agent).map_err(|e| e.to_string())?;

    // Re-read to get timestamps
    queries::get_agent_by_id(&db, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent not found after creation".to_string())
}

#[tauri::command]
pub fn get_agents(state: State<'_, AppState>) -> Result<Vec<queries::Agent>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_agents(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_agent(state: State<'_, AppState>, agent_id: String) -> Result<queries::Agent, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_agent_by_id(&db, &agent_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent not found".to_string())
}

#[tauri::command]
pub fn update_agent(
    state: State<'_, AppState>,
    request: UpdateAgentRequest,
) -> Result<queries::Agent, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let agent = queries::Agent {
        id: request.id.clone(),
        name: request.name,
        role: request.role,
        system_prompt: request.system_prompt,
        working_directory: request.working_directory,
        model: request.model.unwrap_or_else(|| "sonnet".to_string()),
        max_turns: request.max_turns.unwrap_or(25),
        skills: serde_json::to_string(&request.skills.unwrap_or_default())
            .unwrap_or_else(|_| "[]".to_string()),
        env_vars: request
            .env_vars
            .map(|v| v.to_string())
            .unwrap_or_else(|| "{}".to_string()),
        status: String::new(),
        pid: None,
        session_id: None,
        created_at: String::new(),
        updated_at: String::new(),
    };
    queries::update_agent(&db, &agent).map_err(|e| e.to_string())?;
    queries::get_agent_by_id(&db, &request.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent not found".to_string())
}

#[tauri::command]
pub fn delete_agent(state: State<'_, AppState>, agent_id: String) -> Result<(), String> {
    // Stop agent if running
    let _ = manager::stop_agent(&state, &agent_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::delete_agent(&db, &agent_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_agent(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<(), String> {
    manager::spawn_agent(app_handle, &state, &agent_id).await
}

#[tauri::command]
pub fn stop_agent(state: State<'_, AppState>, agent_id: String) -> Result<(), String> {
    manager::stop_agent(&state, &agent_id)
}

#[tauri::command]
pub fn pause_agent(state: State<'_, AppState>, agent_id: String) -> Result<(), String> {
    // For pause, we stop the process but keep the session_id for resume
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::update_agent_status(&db, &agent_id, "paused").map_err(|e| e.to_string())?;

    // Kill the process but preserve session_id
    let mut procs = state.processes.lock().map_err(|e| e.to_string())?;
    if let Some(mut handle) = procs.remove(&agent_id) {
        let _ = handle.child.start_kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_agent(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    agent_id: String,
    additional_context: Option<String>,
) -> Result<(), String> {
    manager::resume_agent(app_handle, &state, &agent_id, additional_context).await
}

#[tauri::command]
pub fn get_agent_logs(
    state: State<'_, AppState>,
    agent_id: String,
    limit: Option<i64>,
) -> Result<Vec<queries::AgentLog>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_agent_logs(&db, &agent_id, limit.unwrap_or(100)).map_err(|e| e.to_string())
}
