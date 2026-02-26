use axum::{
    Router,
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Json,
};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::net::TcpListener;

use crate::db::{queries, schema};

/// The port the MCP HTTP server is listening on.
/// Set once at startup; read by `spawn_agent` to inject env vars.
pub static MCP_PORT: OnceLock<u16> = OnceLock::new();

// ─── Shared state ────────────────────────────────────────────

#[derive(Clone)]
struct McpState {
    /// Dedicated DB connection for the MCP server (WAL allows concurrent access).
    db: Arc<Mutex<Connection>>,
}

// ─── Request / response types ────────────────────────────────

#[derive(Deserialize)]
struct PostMessageBody {
    /// ID of the agent posting the message.
    agent_id: String,
    /// Optional target agent ID. Omit to broadcast to all agents.
    to_agent: Option<String>,
    /// One of: insight | finding | question | task_update | request | response
    message_type: String,
    content: String,
    metadata: Option<String>,
}

#[derive(Deserialize)]
struct AddKnowledgeBody {
    agent_id: String,
    /// e.g. "research" | "decision" | "error" | "solution"
    category: String,
    title: String,
    content: String,
    tags: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct GetMessagesParams {
    agent_id: String,
    /// Max messages to return (default 20).
    limit: Option<i64>,
}

// ─── Handlers ────────────────────────────────────────────────

async fn health() -> &'static str {
    "ok"
}

async fn handle_post_message(
    State(state): State<McpState>,
    Json(body): Json<PostMessageBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state
        .db
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let id = queries::insert_message(
        &db,
        &body.agent_id,
        body.to_agent.as_deref(),
        &body.message_type,
        &body.content,
        body.metadata.as_deref(),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    log::info!(
        "[MCP] {} posted '{}' message (id={})",
        body.agent_id,
        body.message_type,
        id
    );
    Ok(Json(json!({ "id": id, "ok": true })))
}

async fn handle_add_knowledge(
    State(state): State<McpState>,
    Json(body): Json<AddKnowledgeBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state
        .db
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let tags =
        serde_json::to_string(&body.tags.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

    let id = queries::insert_knowledge(
        &db,
        &body.agent_id,
        &body.category,
        &body.title,
        &body.content,
        &tags,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    log::info!(
        "[MCP] {} added knowledge '{}' (id={})",
        body.agent_id,
        body.title,
        id
    );
    Ok(Json(json!({ "id": id, "ok": true })))
}

async fn handle_get_messages(
    State(state): State<McpState>,
    Query(params): Query<GetMessagesParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state
        .db
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let msgs = queries::get_messages(&db, Some(&params.agent_id), None, params.limit.unwrap_or(20))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!(msgs)))
}

// ─── Server startup ──────────────────────────────────────────

/// Start the MCP HTTP server on a random localhost port.
/// Returns the port so callers can inject it into agent env vars.
/// Spawns the server as a background tokio task.
pub async fn start_mcp_server() -> Result<u16, String> {
    let conn = schema::open_db_connection()
        .map_err(|e| format!("MCP server: failed to open DB: {}", e))?;

    let state = McpState {
        db: Arc::new(Mutex::new(conn)),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/message", post(handle_post_message))
        .route("/knowledge", post(handle_add_knowledge))
        .route("/messages", get(handle_get_messages))
        .with_state(state);

    // Bind to port 0 — OS assigns a free port.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("MCP server: failed to bind: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("MCP server: failed to get addr: {}", e))?
        .port();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("MCP server exited with error: {}", e);
        }
    });

    log::info!("MCP HTTP server listening on http://127.0.0.1:{}", port);
    Ok(port)
}
