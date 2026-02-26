use crate::db;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::process::{Child, ChildStdin};

/// Registry of running agent processes keyed by agent ID
pub type ProcessRegistry = Arc<Mutex<HashMap<String, ProcessHandle>>>;

pub struct ProcessHandle {
    pub child: Child,
    pub session_id: String,
    pub stdin: Option<ChildStdin>,
}

/// Tracks when an agent last produced output, used to detect stalled agents.
#[derive(Debug, Clone)]
pub struct InputWaitInfo {
    pub last_output_at: Instant,
    pub last_output_text: String,
    pub agent_name: String,
    pub notification_sent: bool,
}

/// Registry of agent output timestamps, keyed by agent ID.
pub type InputWaitRegistry = Arc<Mutex<HashMap<String, InputWaitInfo>>>;

/// Tracks which task an agent is currently working on and which coordinator
/// should receive the completion report when the agent finishes.
#[derive(Debug, Clone)]
pub struct AgentAssignment {
    pub task_id: String,
    pub coordinator_id: String,
}

/// Registry of active agent task assignments, keyed by agent ID.
pub type AgentAssignmentMap = Arc<Mutex<HashMap<String, AgentAssignment>>>;

/// Global application state managed by Tauri
pub struct AppState {
    pub db: Mutex<Connection>,
    pub processes: ProcessRegistry,
    pub telegram_running: Mutex<bool>,
    pub input_wait: InputWaitRegistry,
    pub agent_assignments: AgentAssignmentMap,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let conn = db::schema::initialize_db().map_err(|e| format!("DB init failed: {}", e))?;

        Ok(AppState {
            db: Mutex::new(conn),
            processes: Arc::new(Mutex::new(HashMap::new())),
            telegram_running: Mutex::new(false),
            input_wait: Arc::new(Mutex::new(HashMap::new())),
            agent_assignments: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Kill all running agent processes (called on app shutdown)
    pub fn shutdown_all_agents(&self) {
        let mut procs = self.processes.lock().unwrap();
        for (id, handle) in procs.iter_mut() {
            log::info!("Shutting down agent process: {}", id);
            let _ = handle.child.start_kill();
        }
        procs.clear();

        self.input_wait.lock().unwrap().clear();
        self.agent_assignments.lock().unwrap().clear();
    }
}
