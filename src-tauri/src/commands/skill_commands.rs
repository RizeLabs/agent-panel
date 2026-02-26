use crate::db::queries;
use crate::skills::manager as skill_manager;
use crate::state::AppState;
use reqwest;
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

/// Convert a GitHub blob URL to its raw.githubusercontent.com equivalent.
/// If the URL is already raw or not a GitHub blob URL, return it as-is.
fn github_to_raw_url(url: &str) -> String {
    // https://github.com/user/repo/blob/branch/path → https://raw.githubusercontent.com/user/repo/branch/path
    if let Some(rest) = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
    {
        if let Some(blob_pos) = rest.find("/blob/") {
            let (repo_part, after_blob) = rest.split_at(blob_pos);
            let path_part = &after_blob["/blob/".len()..];
            return format!(
                "https://raw.githubusercontent.com/{}/{}",
                repo_part, path_part
            );
        }
    }
    url.to_string()
}

#[tauri::command]
pub async fn import_skill_from_url(url: String) -> Result<skill_manager::SkillDefinition, String> {
    let raw_url = github_to_raw_url(&url);

    let response = reqwest::get(&raw_url)
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch URL (HTTP {}): {}",
            response.status(),
            raw_url
        ));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let skill = skill_manager::parse_skill_md(&content)?;

    let skills_dir = default_skills_dir();
    skill_manager::save_skill(&skills_dir, &skill)?;

    log::info!("Imported skill '{}' from {}", skill.name, url);
    Ok(skill)
}

#[tauri::command]
pub fn import_skills_from_path(
    path: String,
) -> Result<Vec<skill_manager::SkillDefinition>, String> {
    let source = std::path::Path::new(&path);

    if !source.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let skills_dir = default_skills_dir();
    let mut imported = Vec::new();

    let files: Vec<std::path::PathBuf> = if source.is_file() {
        vec![source.to_path_buf()]
    } else if source.is_dir() {
        let entries = std::fs::read_dir(source)
            .map_err(|e| format!("Failed to read directory {}: {}", path, e))?;
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
            .collect()
    } else {
        return Err(format!("Path is neither a file nor a directory: {}", path));
    };

    if files.is_empty() {
        return Err("No .md files found at the given path".to_string());
    }

    for file_path in &files {
        let content = std::fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read {}: {}", file_path.display(), e))?;

        match skill_manager::parse_skill_md(&content) {
            Ok(skill) => {
                skill_manager::save_skill(&skills_dir, &skill)?;
                log::info!(
                    "Imported skill '{}' from {}",
                    skill.name,
                    file_path.display()
                );
                imported.push(skill);
            }
            Err(e) => {
                log::warn!("Skipping {}: {}", file_path.display(), e);
            }
        }
    }

    if imported.is_empty() {
        return Err("No valid skill files found (expected YAML frontmatter with --- delimiters)".to_string());
    }

    Ok(imported)
}

fn default_skills_dir() -> String {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("com.agentpanel.app");
    path.push("skills");
    std::fs::create_dir_all(&path).ok();
    path.to_string_lossy().to_string()
}
