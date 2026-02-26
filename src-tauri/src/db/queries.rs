use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

// ─── Agent Queries ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub system_prompt: Option<String>,
    pub working_directory: Option<String>,
    pub model: String,
    pub max_turns: i64,
    pub skills: String,
    pub env_vars: String,
    pub status: String,
    pub pid: Option<i64>,
    pub session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn insert_agent(conn: &Connection, agent: &Agent) -> Result<()> {
    conn.execute(
        "INSERT INTO agents (id, name, role, system_prompt, working_directory, model, max_turns, skills, env_vars, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            agent.id,
            agent.name,
            agent.role,
            agent.system_prompt,
            agent.working_directory,
            agent.model,
            agent.max_turns,
            agent.skills,
            agent.env_vars,
            agent.status,
        ],
    )?;
    Ok(())
}

pub fn get_all_agents(conn: &Connection) -> Result<Vec<Agent>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, role, system_prompt, working_directory, model, max_turns,
                skills, env_vars, status, pid, session_id, created_at, updated_at
         FROM agents ORDER BY created_at DESC",
    )?;
    let agents = stmt
        .query_map([], |row| {
            Ok(Agent {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                system_prompt: row.get(3)?,
                working_directory: row.get(4)?,
                model: row.get(5)?,
                max_turns: row.get(6)?,
                skills: row.get(7)?,
                env_vars: row.get(8)?,
                status: row.get(9)?,
                pid: row.get(10)?,
                session_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(agents)
}

pub fn get_agent_by_id(conn: &Connection, id: &str) -> Result<Option<Agent>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, role, system_prompt, working_directory, model, max_turns,
                skills, env_vars, status, pid, session_id, created_at, updated_at
         FROM agents WHERE id = ?1",
    )?;
    let mut agents = stmt
        .query_map(params![id], |row| {
            Ok(Agent {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                system_prompt: row.get(3)?,
                working_directory: row.get(4)?,
                model: row.get(5)?,
                max_turns: row.get(6)?,
                skills: row.get(7)?,
                env_vars: row.get(8)?,
                status: row.get(9)?,
                pid: row.get(10)?,
                session_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(agents.pop())
}

pub fn update_agent_status(conn: &Connection, id: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE agents SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

pub fn update_agent_process(
    conn: &Connection,
    id: &str,
    pid: Option<i64>,
    session_id: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE agents SET pid = ?1, session_id = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![pid, session_id, id],
    )?;
    Ok(())
}

pub fn update_agent(conn: &Connection, agent: &Agent) -> Result<()> {
    conn.execute(
        "UPDATE agents SET name=?1, role=?2, system_prompt=?3, working_directory=?4, model=?5,
         max_turns=?6, skills=?7, env_vars=?8, updated_at=CURRENT_TIMESTAMP
         WHERE id=?9",
        params![
            agent.name,
            agent.role,
            agent.system_prompt,
            agent.working_directory,
            agent.model,
            agent.max_turns,
            agent.skills,
            agent.env_vars,
            agent.id,
        ],
    )?;
    Ok(())
}

pub fn delete_agent(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM agent_logs WHERE agent_id = ?1", params![id])?;
    conn.execute("DELETE FROM agents WHERE id = ?1", params![id])?;
    Ok(())
}

// ─── Message Queries ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: i64,
    pub from_agent: String,
    pub to_agent: Option<String>,
    pub message_type: String,
    pub content: String,
    pub metadata: Option<String>,
    pub read_by: String,
    pub created_at: String,
}

pub fn insert_message(
    conn: &Connection,
    from_agent: &str,
    to_agent: Option<&str>,
    message_type: &str,
    content: &str,
    metadata: Option<&str>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO messages (from_agent, to_agent, message_type, content, metadata)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![from_agent, to_agent, message_type, content, metadata],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_messages(
    conn: &Connection,
    agent_id: Option<&str>,
    message_type: Option<&str>,
    limit: i64,
) -> Result<Vec<Message>> {
    let query = match (agent_id, message_type) {
        (Some(_), Some(_)) => {
            "SELECT id, from_agent, to_agent, message_type, content, metadata, read_by, created_at
             FROM messages WHERE (to_agent = ?1 OR to_agent IS NULL) AND message_type = ?2
             ORDER BY created_at DESC LIMIT ?3"
        }
        (Some(_), None) => {
            "SELECT id, from_agent, to_agent, message_type, content, metadata, read_by, created_at
             FROM messages WHERE (to_agent = ?1 OR to_agent IS NULL)
             ORDER BY created_at DESC LIMIT ?3"
        }
        (None, Some(_)) => {
            "SELECT id, from_agent, to_agent, message_type, content, metadata, read_by, created_at
             FROM messages WHERE message_type = ?2
             ORDER BY created_at DESC LIMIT ?3"
        }
        (None, None) => {
            "SELECT id, from_agent, to_agent, message_type, content, metadata, read_by, created_at
             FROM messages ORDER BY created_at DESC LIMIT ?3"
        }
    };

    let mut stmt = conn.prepare(query)?;

    let rows = match (agent_id, message_type) {
        (Some(a), Some(t)) => stmt.query_map(params![a, t, limit], map_message)?,
        (Some(a), None) => stmt.query_map(params![a, "", limit], map_message)?,
        (None, Some(t)) => stmt.query_map(params!["", t, limit], map_message)?,
        (None, None) => stmt.query_map(params!["", "", limit], map_message)?,
    };

    rows.collect::<Result<Vec<_>>>()
}

fn map_message(row: &rusqlite::Row) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        from_agent: row.get(1)?,
        to_agent: row.get(2)?,
        message_type: row.get(3)?,
        content: row.get(4)?,
        metadata: row.get(5)?,
        read_by: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub fn get_unread_messages_for_agent(conn: &Connection, agent_id: &str) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, from_agent, to_agent, message_type, content, metadata, read_by, created_at
         FROM messages
         WHERE (to_agent = ?1 OR to_agent IS NULL)
           AND from_agent != ?1
           AND read_by NOT LIKE '%' || ?1 || '%'
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![agent_id], map_message)?;
    rows.collect::<Result<Vec<_>>>()
}

pub fn mark_messages_read(conn: &Connection, message_ids: &[i64], agent_id: &str) -> Result<()> {
    for msg_id in message_ids {
        // Append agent_id to the read_by JSON array
        conn.execute(
            "UPDATE messages SET read_by = json_insert(read_by, '$[#]', ?1) WHERE id = ?2",
            params![agent_id, msg_id],
        )?;
    }
    Ok(())
}

// ─── Knowledge Queries ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Knowledge {
    pub id: i64,
    pub agent_id: String,
    pub category: String,
    pub title: String,
    pub content: String,
    pub tags: String,
    pub relevance_score: f64,
    pub created_at: String,
}

pub fn insert_knowledge(
    conn: &Connection,
    agent_id: &str,
    category: &str,
    title: &str,
    content: &str,
    tags: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO knowledge (agent_id, category, title, content, tags)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![agent_id, category, title, content, tags],
    )?;
    let id = conn.last_insert_rowid();
    // Update FTS index
    conn.execute(
        "INSERT INTO knowledge_fts (rowid, title, content, tags) VALUES (?1, ?2, ?3, ?4)",
        params![id, title, content, tags],
    )?;
    Ok(id)
}

pub fn get_knowledge(
    conn: &Connection,
    category: Option<&str>,
    limit: i64,
) -> Result<Vec<Knowledge>> {
    let (query, use_category) = match category {
        Some(_) => (
            "SELECT id, agent_id, category, title, content, tags, relevance_score, created_at
             FROM knowledge WHERE category = ?1 ORDER BY created_at DESC LIMIT ?2",
            true,
        ),
        None => (
            "SELECT id, agent_id, category, title, content, tags, relevance_score, created_at
             FROM knowledge ORDER BY created_at DESC LIMIT ?2",
            false,
        ),
    };

    let mut stmt = conn.prepare(query)?;
    let rows = if use_category {
        stmt.query_map(params![category.unwrap(), limit], map_knowledge)?
    } else {
        stmt.query_map(params!["", limit], map_knowledge)?
    };
    rows.collect::<Result<Vec<_>>>()
}

fn map_knowledge(row: &rusqlite::Row) -> rusqlite::Result<Knowledge> {
    Ok(Knowledge {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        category: row.get(2)?,
        title: row.get(3)?,
        content: row.get(4)?,
        tags: row.get(5)?,
        relevance_score: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub fn search_knowledge(conn: &Connection, query: &str, limit: i64) -> Result<Vec<Knowledge>> {
    let mut stmt = conn.prepare(
        "SELECT k.id, k.agent_id, k.category, k.title, k.content, k.tags, k.relevance_score, k.created_at
         FROM knowledge k
         JOIN knowledge_fts fts ON k.id = fts.rowid
         WHERE knowledge_fts MATCH ?1
         ORDER BY rank LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![query, limit], map_knowledge)?;
    rows.collect::<Result<Vec<_>>>()
}

// ─── Task Queries ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub notion_page_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub assigned_agent: Option<String>,
    pub priority: String,
    pub parent_task_id: Option<String>,
    pub blocked_by: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn insert_task(conn: &Connection, task: &Task) -> Result<()> {
    conn.execute(
        "INSERT INTO tasks (id, notion_page_id, title, description, status, assigned_agent, priority, parent_task_id, blocked_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            task.id,
            task.notion_page_id,
            task.title,
            task.description,
            task.status,
            task.assigned_agent,
            task.priority,
            task.parent_task_id,
            task.blocked_by,
        ],
    )?;
    Ok(())
}

pub fn get_tasks(
    conn: &Connection,
    status: Option<&str>,
    assigned_agent: Option<&str>,
) -> Result<Vec<Task>> {
    let query = match (status, assigned_agent) {
        (Some(_), Some(_)) => {
            "SELECT id, notion_page_id, title, description, status, assigned_agent, priority, parent_task_id, blocked_by, created_at, updated_at
             FROM tasks WHERE status = ?1 AND assigned_agent = ?2 ORDER BY created_at DESC"
        }
        (Some(_), None) => {
            "SELECT id, notion_page_id, title, description, status, assigned_agent, priority, parent_task_id, blocked_by, created_at, updated_at
             FROM tasks WHERE status = ?1 ORDER BY created_at DESC"
        }
        (None, Some(_)) => {
            "SELECT id, notion_page_id, title, description, status, assigned_agent, priority, parent_task_id, blocked_by, created_at, updated_at
             FROM tasks WHERE assigned_agent = ?2 ORDER BY created_at DESC"
        }
        (None, None) => {
            "SELECT id, notion_page_id, title, description, status, assigned_agent, priority, parent_task_id, blocked_by, created_at, updated_at
             FROM tasks ORDER BY created_at DESC"
        }
    };

    let mut stmt = conn.prepare(query)?;
    let rows = match (status, assigned_agent) {
        (Some(s), Some(a)) => stmt.query_map(params![s, a], map_task)?,
        (Some(s), None) => stmt.query_map(params![s], map_task)?,
        (None, Some(a)) => stmt.query_map(params![a], map_task)?,
        (None, None) => stmt.query_map([], map_task)?,
    };
    rows.collect::<Result<Vec<_>>>()
}

fn map_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        notion_page_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        status: row.get(4)?,
        assigned_agent: row.get(5)?,
        priority: row.get(6)?,
        parent_task_id: row.get(7)?,
        blocked_by: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub fn update_task(conn: &Connection, task: &Task) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET title=?1, description=?2, status=?3, assigned_agent=?4, priority=?5,
         blocked_by=?6, updated_at=CURRENT_TIMESTAMP WHERE id=?7",
        params![
            task.title,
            task.description,
            task.status,
            task.assigned_agent,
            task.priority,
            task.blocked_by,
            task.id,
        ],
    )?;
    Ok(())
}

// ─── Log Queries ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentLog {
    pub id: i64,
    pub agent_id: String,
    pub log_type: String,
    pub content: String,
    pub created_at: String,
}

pub fn insert_log(conn: &Connection, agent_id: &str, log_type: &str, content: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO agent_logs (agent_id, log_type, content) VALUES (?1, ?2, ?3)",
        params![agent_id, log_type, content],
    )?;
    Ok(())
}

pub fn get_agent_logs(conn: &Connection, agent_id: &str, limit: i64) -> Result<Vec<AgentLog>> {
    let mut stmt = conn.prepare(
        "SELECT id, agent_id, log_type, content, created_at
         FROM agent_logs WHERE agent_id = ?1 ORDER BY created_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![agent_id, limit], |row| {
        Ok(AgentLog {
            id: row.get(0)?,
            agent_id: row.get(1)?,
            log_type: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>>>()
}

// ─── Settings Queries ─────────────────────────────────────────

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
    match rows.next() {
        Some(Ok(val)) => Ok(Some(val)),
        _ => Ok(None),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_all_settings(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    rows.collect::<Result<Vec<_>>>()
}

// ─── Swarm Queries ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Swarm {
    pub id: String,
    pub name: String,
    pub goal: Option<String>,
    pub agent_ids: String,
    pub coordinator_id: Option<String>,
    pub status: String,
    pub created_at: String,
}

pub fn insert_swarm(conn: &Connection, swarm: &Swarm) -> Result<()> {
    conn.execute(
        "INSERT INTO swarms (id, name, goal, agent_ids, coordinator_id, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            swarm.id,
            swarm.name,
            swarm.goal,
            swarm.agent_ids,
            swarm.coordinator_id,
            swarm.status,
        ],
    )?;
    Ok(())
}

pub fn get_swarm(conn: &Connection, id: &str) -> Result<Option<Swarm>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, goal, agent_ids, coordinator_id, status, created_at FROM swarms WHERE id = ?1",
    )?;
    let mut rows = stmt
        .query_map(params![id], |row| {
            Ok(Swarm {
                id: row.get(0)?,
                name: row.get(1)?,
                goal: row.get(2)?,
                agent_ids: row.get(3)?,
                coordinator_id: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(rows.pop())
}

pub fn update_swarm_status(conn: &Connection, id: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE swarms SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}
