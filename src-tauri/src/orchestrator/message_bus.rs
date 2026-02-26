use std::sync::Mutex;

use rusqlite::Connection;

use crate::db::queries::{self, Message};

/// Post a message from one agent to another (or broadcast if `to` is None).
/// Returns the inserted message ID.
pub fn post_message(
    db: &Mutex<Connection>,
    from: &str,
    to: Option<&str>,
    msg_type: &str,
    content: &str,
    metadata: Option<&str>,
) -> Result<i64, String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_message(&conn, from, to, msg_type, content, metadata)
        .map_err(|e| format!("Failed to insert message: {}", e))
}

/// Retrieve all unread messages destined for (or broadcast to) the given agent.
pub fn get_pending_messages(
    db: &Mutex<Connection>,
    agent_id: &str,
) -> Result<Vec<Message>, String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::get_unread_messages_for_agent(&conn, agent_id)
        .map_err(|e| format!("Failed to get pending messages: {}", e))
}

/// Mark a set of messages as read by the given agent.
pub fn mark_read(
    db: &Mutex<Connection>,
    message_ids: &[i64],
    agent_id: &str,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::mark_messages_read(&conn, message_ids, agent_id)
        .map_err(|e| format!("Failed to mark messages read: {}", e))
}

/// Post a broadcast message (to = None) visible to all agents.
/// Returns the inserted message ID.
pub fn broadcast(
    db: &Mutex<Connection>,
    from: &str,
    msg_type: &str,
    content: &str,
) -> Result<i64, String> {
    post_message(db, from, None, msg_type, content, None)
}

/// Format a slice of messages into a human-readable context string suitable for
/// injection into an agent's prompt as additional context.
pub fn build_context_injection(messages: &[Message]) -> String {
    if messages.is_empty() {
        return String::new();
    }

    let mut ctx = String::from("\n--- Pending Messages ---\n");
    for msg in messages {
        let to_label = msg
            .to_agent
            .as_deref()
            .unwrap_or("broadcast");
        ctx.push_str(&format!(
            "[{}] From: {} | To: {} | Type: {}\n{}\n\n",
            msg.created_at, msg.from_agent, to_label, msg.message_type, msg.content
        ));
    }
    ctx.push_str("--- End Messages ---\n");
    ctx
}
