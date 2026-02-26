use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

// ─── Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub content: String,
    pub created_at: String,
}

// ─── Helpers ─────────────────────────────────────────────────

/// Resolve the default claude-mem database path.
fn claude_mem_db_path() -> Result<PathBuf, String> {
    let home = dirs_next()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    Ok(home.join(".claude-mem").join("memories.db"))
}

/// Platform-independent home directory lookup.
fn dirs_next() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from))
}

/// Return the path to the settings file for a given working directory.
fn settings_path(working_dir: &str) -> PathBuf {
    Path::new(working_dir)
        .join(".claude")
        .join("settings.local.json")
}

// ─── Public API ──────────────────────────────────────────────

/// Ensure that the `claude-mem` MCP server is configured in the
/// agent's working directory at `.claude/settings.local.json`.
///
/// If the file does not exist or does not contain a `claude-mem`
/// entry under `mcpServers`, this function adds the default
/// configuration.
pub fn ensure_claude_mem_configured(working_dir: &str) -> Result<(), String> {
    let path = settings_path(working_dir);

    // Read the existing settings, or start with an empty object.
    let mut settings: Value = if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?
    } else {
        serde_json::json!({})
    };

    // Ensure the top-level object is a map.
    let root = settings
        .as_object_mut()
        .ok_or_else(|| "settings.local.json root is not an object".to_string())?;

    // Ensure `mcpServers` key exists and is an object.
    if !root.contains_key("mcpServers") {
        root.insert(
            "mcpServers".to_string(),
            serde_json::json!({}),
        );
    }

    let mcp_servers = root
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| "mcpServers is not an object".to_string())?;

    // If claude-mem is already configured, nothing to do.
    if mcp_servers.contains_key("claude-mem") {
        log::info!("claude-mem MCP server already configured");
        return Ok(());
    }

    // Add default claude-mem configuration.
    let default_config = serde_json::json!({
        "command": "claude-mem",
        "args": ["server"],
        "description": "Claude memory server for persistent knowledge storage"
    });

    mcp_servers.insert("claude-mem".to_string(), default_config);

    // Ensure the parent directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    // Write back.
    let serialized = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    std::fs::write(&path, serialized)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;

    log::info!("Added claude-mem MCP server configuration to {}", path.display());
    Ok(())
}

/// Search the claude-mem SQLite database for memory entries matching
/// the given query.  Uses FTS if available, otherwise falls back to
/// a simple LIKE search.
pub fn search_claude_mem(
    _working_dir: &str,
    query: &str,
) -> Result<Vec<MemoryEntry>, String> {
    let db_path = claude_mem_db_path()?;

    if !db_path.exists() {
        return Err(format!(
            "claude-mem database not found at {}",
            db_path.display()
        ));
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open claude-mem DB: {}", e))?;

    // Try FTS search first; fall back to LIKE if the FTS table doesn't exist.
    let entries = match search_fts(&conn, query) {
        Ok(results) => results,
        Err(_) => search_like(&conn, query)?,
    };

    Ok(entries)
}

/// Search using FTS5 (if claude-mem has set up an FTS table).
fn search_fts(
    conn: &rusqlite::Connection,
    query: &str,
) -> Result<Vec<MemoryEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.content, m.created_at
             FROM memories m
             JOIN memories_fts fts ON m.id = fts.rowid
             WHERE memories_fts MATCH ?1
             ORDER BY rank
             LIMIT 50",
        )
        .map_err(|e| format!("FTS query prepare failed: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![query], |row| {
            Ok(MemoryEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("FTS query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect FTS results: {}", e))
}

/// Fallback search using LIKE when FTS is not available.
fn search_like(
    conn: &rusqlite::Connection,
    query: &str,
) -> Result<Vec<MemoryEntry>, String> {
    let pattern = format!("%{}%", query);

    let mut stmt = conn
        .prepare(
            "SELECT id, content, created_at
             FROM memories
             WHERE content LIKE ?1
             ORDER BY created_at DESC
             LIMIT 50",
        )
        .map_err(|e| format!("LIKE query prepare failed: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![pattern], |row| {
            Ok(MemoryEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("LIKE query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect LIKE results: {}", e))
}
