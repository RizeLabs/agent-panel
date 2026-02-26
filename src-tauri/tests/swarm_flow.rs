//! Integration tests for the swarm + message-bus + MCP server flow.
//!
//! Every test runs against an isolated in-memory SQLite database so nothing
//! touches the production DB or spawns real claude processes.

use agent_panel_lib::db::{queries, schema};
use agent_panel_lib::mcp::start_mcp_server_with_conn;

// ─── Helpers ─────────────────────────────────────────────────

fn make_agent(id: &str, name: &str, role: &str) -> queries::Agent {
    queries::Agent {
        id: id.to_string(),
        name: name.to_string(),
        role: role.to_string(),
        system_prompt: Some(format!("You are a {} agent.", role)),
        working_directory: None,
        model: "claude-haiku-4-5-20251001".to_string(),
        max_turns: 5,
        skills: "[]".to_string(),
        env_vars: "{}".to_string(),
        status: "idle".to_string(),
        pid: None,
        session_id: None,
        prompt_context: None,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn make_swarm(
    id: &str,
    name: &str,
    goal: &str,
    agent_ids: &[&str],
    coordinator_id: Option<&str>,
) -> queries::Swarm {
    queries::Swarm {
        id: id.to_string(),
        name: name.to_string(),
        goal: Some(goal.to_string()),
        agent_ids: serde_json::to_string(agent_ids).unwrap(),
        coordinator_id: coordinator_id.map(|s| s.to_string()),
        status: "stopped".to_string(),
        created_at: String::new(),
    }
}

// ─── DB layer tests ───────────────────────────────────────────

/// Creating two agents and a swarm that references them is persisted correctly.
#[test]
fn test_create_swarm_with_two_agents() {
    let conn = schema::create_test_db().expect("test DB");

    // Insert agents
    let researcher = make_agent("agent-researcher", "Researcher", "researcher");
    let coder = make_agent("agent-coder", "Coder", "coder");
    queries::insert_agent(&conn, &researcher).expect("insert researcher");
    queries::insert_agent(&conn, &coder).expect("insert coder");

    // Verify both agents exist
    let agents = queries::get_all_agents(&conn).expect("get agents");
    assert_eq!(agents.len(), 2);
    assert!(agents.iter().any(|a| a.id == "agent-researcher"));
    assert!(agents.iter().any(|a| a.id == "agent-coder"));

    // Create a coordinator agent owned by the swarm
    let coordinator = make_agent("agent-coordinator", "Coordinator", "coordinator");
    queries::insert_agent(&conn, &coordinator).expect("insert coordinator");

    // Create swarm
    let swarm = make_swarm(
        "swarm-test",
        "Test Swarm",
        "Research and implement feature X",
        &["agent-researcher", "agent-coder"],
        Some("agent-coordinator"),
    );
    queries::insert_swarm(&conn, &swarm).expect("insert swarm");

    // Read back and verify
    let fetched = queries::get_swarm(&conn, "swarm-test")
        .expect("get swarm")
        .expect("swarm exists");

    assert_eq!(fetched.name, "Test Swarm");
    assert_eq!(fetched.goal.as_deref(), Some("Research and implement feature X"));
    assert_eq!(fetched.status, "stopped");
    assert_eq!(fetched.coordinator_id.as_deref(), Some("agent-coordinator"));

    let ids: Vec<String> = serde_json::from_str(&fetched.agent_ids).unwrap();
    assert_eq!(ids, vec!["agent-researcher", "agent-coder"]);
}

/// Swarm status transitions: stopped → running → stopped.
#[test]
fn test_swarm_status_lifecycle() {
    let conn = schema::create_test_db().expect("test DB");

    queries::insert_agent(&conn, &make_agent("agent-1", "Worker", "coder")).unwrap();
    queries::insert_swarm(
        &conn,
        &make_swarm("swarm-lifecycle", "Lifecycle", "goal", &["agent-1"], None),
    )
    .unwrap();

    // Initial state
    let s = queries::get_swarm(&conn, "swarm-lifecycle").unwrap().unwrap();
    assert_eq!(s.status, "stopped");

    // Start
    queries::update_swarm_status(&conn, "swarm-lifecycle", "running").unwrap();
    let s = queries::get_swarm(&conn, "swarm-lifecycle").unwrap().unwrap();
    assert_eq!(s.status, "running");

    // Stop
    queries::update_swarm_status(&conn, "swarm-lifecycle", "stopped").unwrap();
    let s = queries::get_swarm(&conn, "swarm-lifecycle").unwrap().unwrap();
    assert_eq!(s.status, "stopped");
}

/// Agent status transitions when they are started and stopped.
#[test]
fn test_agent_status_transitions() {
    let conn = schema::create_test_db().expect("test DB");

    queries::insert_agent(&conn, &make_agent("agent-a", "Alpha", "coder")).unwrap();

    let a = queries::get_agent_by_id(&conn, "agent-a").unwrap().unwrap();
    assert_eq!(a.status, "idle");

    queries::update_agent_status(&conn, "agent-a", "running").unwrap();
    let a = queries::get_agent_by_id(&conn, "agent-a").unwrap().unwrap();
    assert_eq!(a.status, "running");

    queries::update_agent_process(&conn, "agent-a", Some(12345), Some("sess-abc")).unwrap();
    let a = queries::get_agent_by_id(&conn, "agent-a").unwrap().unwrap();
    assert_eq!(a.pid, Some(12345));
    assert_eq!(a.session_id.as_deref(), Some("sess-abc"));

    queries::update_agent_status(&conn, "agent-a", "stopped").unwrap();
    let a = queries::get_agent_by_id(&conn, "agent-a").unwrap().unwrap();
    assert_eq!(a.status, "stopped");
}

// ─── Message bus tests ────────────────────────────────────────

/// Agents can broadcast messages and address them to specific peers.
#[test]
fn test_message_bus_broadcast_and_direct() {
    let conn = schema::create_test_db().expect("test DB");

    queries::insert_agent(&conn, &make_agent("agent-r", "Researcher", "researcher")).unwrap();
    queries::insert_agent(&conn, &make_agent("agent-c", "Coder", "coder")).unwrap();

    // Broadcast insight (no to_agent)
    let id1 = queries::insert_message(
        &conn,
        "agent-r",
        None,
        "insight",
        "The API requires OAuth2 authentication",
        None,
    )
    .expect("insert broadcast");
    assert!(id1 > 0);

    // Direct question to coder
    let id2 = queries::insert_message(
        &conn,
        "agent-r",
        Some("agent-c"),
        "question",
        "Can you implement the OAuth2 flow?",
        None,
    )
    .expect("insert direct message");
    assert!(id2 > id1);

    // Coder's inbox: should see both (broadcast + direct)
    let inbox = queries::get_messages(&conn, Some("agent-c"), None, 50).unwrap();
    assert_eq!(inbox.len(), 2, "coder should see broadcast and direct message");

    // Researcher's inbox: should only see broadcast (no direct messages to researcher)
    let inbox_r = queries::get_messages(&conn, Some("agent-r"), None, 50).unwrap();
    assert_eq!(inbox_r.len(), 1, "researcher only sees broadcast");
    assert_eq!(inbox_r[0].message_type, "insight");
}

/// Unread tracking: messages show as unread until marked read.
#[test]
fn test_message_unread_and_mark_read() {
    let conn = schema::create_test_db().expect("test DB");

    queries::insert_agent(&conn, &make_agent("sender", "Sender", "researcher")).unwrap();
    queries::insert_agent(&conn, &make_agent("receiver", "Receiver", "coder")).unwrap();

    // Post 3 messages to receiver
    for i in 1..=3 {
        queries::insert_message(
            &conn,
            "sender",
            Some("receiver"),
            "task_update",
            &format!("Task {} completed", i),
            None,
        )
        .unwrap();
    }

    // All 3 should be unread
    let unread = queries::get_unread_messages_for_agent(&conn, "receiver").unwrap();
    assert_eq!(unread.len(), 3);

    // Mark first 2 as read
    let ids: Vec<i64> = unread[..2].iter().map(|m| m.id).collect();
    queries::mark_messages_read(&conn, &ids, "receiver").unwrap();

    // Now only 1 should remain unread
    let still_unread = queries::get_unread_messages_for_agent(&conn, "receiver").unwrap();
    assert_eq!(still_unread.len(), 1);

    // Mark the last one read too
    let last_ids: Vec<i64> = still_unread.iter().map(|m| m.id).collect();
    queries::mark_messages_read(&conn, &last_ids, "receiver").unwrap();

    let all_read = queries::get_unread_messages_for_agent(&conn, "receiver").unwrap();
    assert_eq!(all_read.len(), 0, "no unread messages remain");
}

/// Coordinator receives completion reports and findings from member agents.
#[test]
fn test_coordinator_receives_agent_reports() {
    let conn = schema::create_test_db().expect("test DB");

    queries::insert_agent(&conn, &make_agent("coord", "Coordinator", "coordinator")).unwrap();
    queries::insert_agent(&conn, &make_agent("worker-1", "Worker 1", "coder")).unwrap();
    queries::insert_agent(&conn, &make_agent("worker-2", "Worker 2", "researcher")).unwrap();

    // Workers post completion reports to coordinator
    queries::insert_message(
        &conn,
        "worker-1",
        Some("coord"),
        "completion_report",
        "COMPLETION REPORT\nAgent: worker-1\nImplemented OAuth2 client",
        None,
    )
    .unwrap();

    queries::insert_message(
        &conn,
        "worker-2",
        Some("coord"),
        "finding",
        "GitHub API rate limit is 5000 req/hr for authenticated users",
        None,
    )
    .unwrap();

    // Coordinator's unread queue
    let unread = queries::get_unread_messages_for_agent(&conn, "coord").unwrap();
    assert_eq!(unread.len(), 2);
    assert!(unread.iter().any(|m| m.message_type == "completion_report"));
    assert!(unread.iter().any(|m| m.message_type == "finding"));

    // Coordinator marks them all read after processing
    let ids: Vec<i64> = unread.iter().map(|m| m.id).collect();
    queries::mark_messages_read(&conn, &ids, "coord").unwrap();

    let remaining = queries::get_unread_messages_for_agent(&conn, "coord").unwrap();
    assert_eq!(remaining.len(), 0);
}

/// Knowledge base: agents can add entries and retrieve them.
#[test]
fn test_knowledge_base() {
    let conn = schema::create_test_db().expect("test DB");

    queries::insert_agent(&conn, &make_agent("agent-k", "Knower", "researcher")).unwrap();

    let id = queries::insert_knowledge(
        &conn,
        "agent-k",
        "research",
        "OAuth2 Flow",
        "The authorization code flow requires PKCE for public clients.",
        "[]",
    )
    .expect("insert knowledge");
    assert!(id > 0);

    let entries = queries::get_knowledge(&conn, Some("research"), 10).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].title, "OAuth2 Flow");
    assert_eq!(entries[0].agent_id, "agent-k");

    // Search
    let results = queries::search_knowledge(&conn, "PKCE", 10).unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].content.contains("PKCE"));
}

/// Deleting a swarm removes the swarm record and detaches tasks, but leaves
/// member agents intact (they are independent resources).
#[test]
fn test_delete_swarm_leaves_agents_intact() {
    let conn = schema::create_test_db().expect("test DB");

    queries::insert_agent(&conn, &make_agent("a1", "Agent 1", "coder")).unwrap();
    queries::insert_agent(&conn, &make_agent("a2", "Agent 2", "researcher")).unwrap();
    queries::insert_swarm(
        &conn,
        &make_swarm("swarm-del", "Deletable", "goal", &["a1", "a2"], None),
    )
    .unwrap();

    // Delete the swarm
    queries::delete_swarm(&conn, "swarm-del").unwrap();

    // Swarm is gone
    let gone = queries::get_swarm(&conn, "swarm-del").unwrap();
    assert!(gone.is_none(), "swarm should be deleted");

    // Agents are still there
    let agents = queries::get_all_agents(&conn).unwrap();
    assert_eq!(agents.len(), 2, "agents should survive swarm deletion");
}

// ─── MCP HTTP server tests ────────────────────────────────────

/// POST /message — agent posts an insight via HTTP, it lands in the DB.
#[tokio::test]
async fn test_mcp_post_message() {
    let conn = schema::create_test_db().expect("test DB");
    queries::insert_agent(&conn, &make_agent("http-agent", "HTTP Agent", "coder")).unwrap();

    let port = start_mcp_server_with_conn(conn).await.expect("start server");
    let base = format!("http://127.0.0.1:{}", port);

    // Health check
    let health = reqwest::get(format!("{}/health", base)).await.unwrap();
    assert_eq!(health.status(), 200);

    // Post a message
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/message", base))
        .json(&serde_json::json!({
            "agent_id": "http-agent",
            "message_type": "insight",
            "content": "Discovered that the API uses JSON:API format"
        }))
        .send()
        .await
        .expect("POST /message");

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["ok"], true);
    assert!(body["id"].as_i64().unwrap() > 0);
}

/// POST /knowledge — agent saves a knowledge entry via HTTP.
#[tokio::test]
async fn test_mcp_add_knowledge() {
    let conn = schema::create_test_db().expect("test DB");
    queries::insert_agent(&conn, &make_agent("k-agent", "K Agent", "researcher")).unwrap();

    let port = start_mcp_server_with_conn(conn).await.expect("start server");
    let base = format!("http://127.0.0.1:{}", port);

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/knowledge", base))
        .json(&serde_json::json!({
            "agent_id": "k-agent",
            "category": "architecture",
            "title": "Database schema",
            "content": "The messages table uses a read_by JSON array for multi-agent delivery.",
            "tags": ["db", "schema"]
        }))
        .send()
        .await
        .expect("POST /knowledge");

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["ok"], true);
}

/// GET /messages — agent retrieves its inbox via HTTP.
#[tokio::test]
async fn test_mcp_get_messages() {
    let conn = schema::create_test_db().expect("test DB");

    // Seed: two agents, one message in inbox
    queries::insert_agent(&conn, &make_agent("sender", "Sender", "researcher")).unwrap();
    queries::insert_agent(&conn, &make_agent("recipient", "Recipient", "coder")).unwrap();
    queries::insert_message(
        &conn,
        "sender",
        Some("recipient"),
        "task_update",
        "Please implement the auth module",
        None,
    )
    .unwrap();

    let port = start_mcp_server_with_conn(conn).await.expect("start server");
    let base = format!("http://127.0.0.1:{}", port);

    let resp = reqwest::get(format!("{}/messages?agent_id=recipient&limit=10", base))
        .await
        .expect("GET /messages");

    assert_eq!(resp.status(), 200);
    let messages: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["message_type"], "task_update");
    assert_eq!(messages[0]["from_agent"], "sender");
}

/// Full swarm flow: create swarm, simulate agents posting insights, coordinator
/// reads unread messages, marks them read.
#[test]
fn test_full_swarm_collaboration_flow() {
    let conn = schema::create_test_db().expect("test DB");

    // ── Setup ──────────────────────────────────────────────────
    let researcher = make_agent("r1", "Researcher", "researcher");
    let coder = make_agent("c1", "Coder", "coder");
    let coordinator = make_agent("coord1", "Coordinator", "coordinator");

    queries::insert_agent(&conn, &researcher).unwrap();
    queries::insert_agent(&conn, &coder).unwrap();
    queries::insert_agent(&conn, &coordinator).unwrap();

    let swarm = make_swarm(
        "swarm-full",
        "Feature X",
        "Research and implement Feature X end-to-end",
        &["r1", "c1"],
        Some("coord1"),
    );
    queries::insert_swarm(&conn, &swarm).unwrap();
    queries::update_swarm_status(&conn, "swarm-full", "running").unwrap();

    // ── Researcher discovers something and posts to coordinator ─
    queries::insert_message(
        &conn,
        "r1",
        Some("coord1"),
        "finding",
        "Feature X requires a new DB column: users.feature_x_enabled BOOLEAN",
        None,
    )
    .unwrap();

    // ── Researcher asks coder a question ───────────────────────
    queries::insert_message(
        &conn,
        "r1",
        Some("c1"),
        "question",
        "Which migration framework are we using?",
        None,
    )
    .unwrap();

    // ── Coder replies and broadcasts its own insight ───────────
    queries::insert_message(
        &conn,
        "c1",
        Some("r1"),
        "response",
        "We use Diesel. Migration files live in migrations/.",
        None,
    )
    .unwrap();

    queries::insert_message(
        &conn,
        "c1",
        None, // broadcast
        "insight",
        "Diesel schema macro auto-generates the Rust types — no manual struct needed",
        None,
    )
    .unwrap();

    // ── Verify coordinator inbox ───────────────────────────────
    let coord_unread = queries::get_unread_messages_for_agent(&conn, "coord1").unwrap();
    // coordinator sees: the direct finding + the broadcast insight
    assert_eq!(coord_unread.len(), 2, "coordinator should have 2 unread messages");

    let types: Vec<&str> = coord_unread.iter().map(|m| m.message_type.as_str()).collect();
    assert!(types.contains(&"finding"));
    assert!(types.contains(&"insight"));

    // ── Coordinator processes and marks read ───────────────────
    let ids: Vec<i64> = coord_unread.iter().map(|m| m.id).collect();
    queries::mark_messages_read(&conn, &ids, "coord1").unwrap();

    let after_read = queries::get_unread_messages_for_agent(&conn, "coord1").unwrap();
    assert_eq!(after_read.len(), 0);

    // ── Coder inbox ────────────────────────────────────────────
    let coder_inbox = queries::get_messages(&conn, Some("c1"), None, 50).unwrap();
    // coder sees: direct question from researcher + broadcast insight (own message shown too)
    assert!(coder_inbox.len() >= 1);
    assert!(coder_inbox
        .iter()
        .any(|m| m.message_type == "question" && m.from_agent == "r1"));

    // ── Stop swarm ─────────────────────────────────────────────
    queries::update_swarm_status(&conn, "swarm-full", "stopped").unwrap();
    let final_status = queries::get_swarm(&conn, "swarm-full").unwrap().unwrap();
    assert_eq!(final_status.status, "stopped");
}
