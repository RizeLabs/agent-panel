use rusqlite::{Connection, Result};
use std::path::PathBuf;

/// Get the path to the SQLite database file
fn db_path() -> PathBuf {
    let mut path = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    path.push("agent-panel.db");
    path
}

fn dirs_next() -> Option<PathBuf> {
    // Use the app's data directory
    if let Some(data_dir) = dirs::data_local_dir() {
        let mut path = data_dir;
        path.push("com.agentpanel.app");
        std::fs::create_dir_all(&path).ok();
        return Some(path);
    }
    None
}

/// Initialize the database and run migrations
pub fn initialize_db() -> Result<Connection> {
    let path = db_path();
    let conn = Connection::open(&path)?;

    // Enable WAL mode for better concurrent access
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    run_migrations(&conn)?;

    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            system_prompt TEXT,
            working_directory TEXT,
            model TEXT DEFAULT 'sonnet',
            max_turns INTEGER DEFAULT 25,
            max_budget_usd REAL,
            skills TEXT DEFAULT '[]',
            env_vars TEXT DEFAULT '{}',
            status TEXT DEFAULT 'idle',
            pid INTEGER,
            session_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_agent TEXT NOT NULL,
            to_agent TEXT,
            message_type TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT,
            read_by TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS knowledge (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            relevance_score REAL DEFAULT 1.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            notion_page_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'todo',
            assigned_agent TEXT,
            priority TEXT DEFAULT 'medium',
            parent_task_id TEXT,
            blocked_by TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assigned_agent) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS agent_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            log_type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS swarms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            goal TEXT,
            agent_ids TEXT NOT NULL DEFAULT '[]',
            coordinator_id TEXT,
            status TEXT DEFAULT 'stopped',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (coordinator_id) REFERENCES agents(id)
        );
        ",
    )?;

    // Migration: add goal column to swarms if missing (for existing DBs)
    let has_goal_col: bool = conn
        .prepare("SELECT goal FROM swarms LIMIT 0")
        .is_ok();
    if !has_goal_col {
        conn.execute_batch("ALTER TABLE swarms ADD COLUMN goal TEXT;")?;
    }

    // Create FTS indexes if they don't exist (using a check)
    let has_knowledge_fts: bool = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_fts'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);

    if !has_knowledge_fts {
        conn.execute_batch(
            "CREATE VIRTUAL TABLE knowledge_fts USING fts5(title, content, tags, content=knowledge, content_rowid=id);",
        )?;
    }

    let has_messages_fts: bool = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);

    if !has_messages_fts {
        conn.execute_batch(
            "CREATE VIRTUAL TABLE messages_fts USING fts5(content, metadata, content=messages, content_rowid=id);",
        )?;
    }

    Ok(())
}
