use crate::db;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Child;

/// Registry of running agent processes keyed by agent ID
pub type ProcessRegistry = Arc<Mutex<HashMap<String, ProcessHandle>>>;

pub struct ProcessHandle {
    pub child: Child,
    pub session_id: String,
}

/// Global application state managed by Tauri
pub struct AppState {
    pub db: Mutex<Connection>,
    pub processes: ProcessRegistry,
    pub telegram_running: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let conn = db::schema::initialize_db().map_err(|e| format!("DB init failed: {}", e))?;

        Ok(AppState {
            db: Mutex::new(conn),
            processes: Arc::new(Mutex::new(HashMap::new())),
            telegram_running: Mutex::new(false),
        })
    }

    /// Kill all running agent processes (called on app shutdown)
    pub fn shutdown_all_agents(&self) {
        let mut procs = self.processes.lock().unwrap();
        for (id, handle) in procs.iter_mut() {
            log::info!("Shutting down agent process: {}", id);
            // Send kill signal - best effort
            let _ = handle.child.start_kill();
        }
        procs.clear();
    }
}
