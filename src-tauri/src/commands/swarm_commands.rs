use crate::db::queries;
use crate::orchestrator::swarm;
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct SwarmAgentConfig {
    pub agent_id: String,
    pub system_prompt: Option<String>,
    pub skills: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSwarmRequest {
    pub name: String,
    pub goal: Option<String>,
    pub agent_configs: Vec<SwarmAgentConfig>,
}

#[tauri::command]
pub fn create_swarm(
    state: State<'_, AppState>,
    request: CreateSwarmRequest,
) -> Result<String, String> {
    swarm::create_swarm(&state, &request.name, request.agent_configs, request.goal)
}

#[tauri::command]
pub async fn start_swarm(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    swarm_id: String,
) -> Result<(), String> {
    swarm::start_swarm(app_handle, &state, &swarm_id).await
}

#[tauri::command]
pub fn stop_swarm(state: State<'_, AppState>, swarm_id: String) -> Result<(), String> {
    swarm::stop_swarm(&state, &swarm_id)
}

#[tauri::command]
pub fn get_swarm_status(
    state: State<'_, AppState>,
    swarm_id: String,
) -> Result<queries::Swarm, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_swarm(&db, &swarm_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Swarm not found".to_string())
}
