use crate::db::queries;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub values: HashMap<String, String>,
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let all = queries::get_all_settings(&db).map_err(|e| e.to_string())?;
    let values: HashMap<String, String> = all.into_iter().collect();
    Ok(Settings { values })
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: HashMap<String, String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    for (key, value) in settings {
        queries::set_setting(&db, &key, &value).map_err(|e| e.to_string())?;
    }
    Ok(())
}
