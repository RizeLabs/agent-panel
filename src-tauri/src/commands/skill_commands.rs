use crate::db::queries;
use crate::skills::manager as skill_manager;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_skills() -> Result<Vec<skill_manager::SkillDefinition>, String> {
    let skills_dir = default_skills_dir();
    skill_manager::list_skills(&skills_dir)
}

#[tauri::command]
pub fn get_skill(name: String) -> Result<skill_manager::SkillDefinition, String> {
    let skills_dir = default_skills_dir();
    skill_manager::get_skill(&skills_dir, &name)
}

#[tauri::command]
pub fn save_skill(skill: skill_manager::SkillDefinition) -> Result<(), String> {
    let skills_dir = default_skills_dir();
    skill_manager::save_skill(&skills_dir, &skill)
}

#[tauri::command]
pub fn delete_skill(name: String) -> Result<(), String> {
    let skills_dir = default_skills_dir();
    skill_manager::delete_skill(&skills_dir, &name)
}

#[tauri::command]
pub fn assign_skill(
    state: State<'_, AppState>,
    agent_id: String,
    skill_name: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let agent = queries::get_agent_by_id(&db, &agent_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent not found".to_string())?;

    let mut skills: Vec<String> =
        serde_json::from_str(&agent.skills).unwrap_or_default();

    if !skills.contains(&skill_name) {
        skills.push(skill_name);
    }

    let skills_json = serde_json::to_string(&skills).map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE agents SET skills = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![skills_json, agent_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn default_skills_dir() -> String {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("com.agentpanel.app");
    path.push("skills");
    std::fs::create_dir_all(&path).ok();
    path.to_string_lossy().to_string()
}
