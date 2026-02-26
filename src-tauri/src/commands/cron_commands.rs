use chrono::Utc;
use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::db::queries::{self, CronJob};
use crate::orchestrator::cron_runner;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateCronJobRequest {
    pub name: String,
    pub description: Option<String>,
    pub interval_secs: i64,
    pub agent_id: String,
    pub action_type: String,
    pub payload: String,
}

#[tauri::command]
pub fn create_cron_job(
    state: State<AppState>,
    request: CreateCronJobRequest,
) -> Result<CronJob, String> {
    let now = Utc::now();
    let next = now + chrono::Duration::seconds(request.interval_secs);

    let job = CronJob {
        id: uuid::Uuid::new_v4().to_string(),
        name: request.name,
        description: request.description,
        interval_secs: request.interval_secs,
        agent_id: request.agent_id,
        action_type: request.action_type,
        payload: request.payload,
        enabled: true,
        last_run_at: None,
        next_run_at: next.format("%Y-%m-%d %H:%M:%S").to_string(),
        run_count: 0,
        created_by: "user".to_string(),
        created_at: now.format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_cron_job(&conn, &job)
        .map_err(|e| format!("Failed to create cron job: {}", e))?;

    Ok(job)
}

#[tauri::command]
pub fn list_cron_jobs(state: State<AppState>) -> Result<Vec<CronJob>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    queries::get_all_cron_jobs(&conn).map_err(|e| format!("Failed to list cron jobs: {}", e))
}

#[tauri::command]
pub fn update_cron_job(state: State<AppState>, job: CronJob) -> Result<CronJob, String> {
    if job.action_type != "post_message" && job.action_type != "inject_context" {
        return Err(format!(
            "Invalid action_type '{}': must be 'post_message' or 'inject_context'",
            job.action_type
        ));
    }

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    queries::update_cron_job(&conn, &job)
        .map_err(|e| format!("Failed to update cron job: {}", e))?;

    Ok(job)
}

#[tauri::command]
pub fn delete_cron_job(state: State<AppState>, job_id: String) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_cron_job(&conn, &job_id)
        .map_err(|e| format!("Failed to delete cron job: {}", e))
}

#[tauri::command]
pub async fn trigger_cron_job(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
) -> Result<(), String> {
    let job = {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        queries::get_cron_job_by_id(&conn, &job_id)
            .map_err(|e| format!("Failed to fetch cron job: {}", e))?
            .ok_or_else(|| format!("Cron job '{}' not found", job_id))?
    };

    // Manual trigger: fire the job but do NOT call record_cron_run
    cron_runner::fire_job(&app_handle, &state, &job).await;
    Ok(())
}
