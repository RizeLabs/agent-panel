use reqwest::Client;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;

use crate::db::queries::{self, Task};

// ─── Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionPage {
    pub id: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub description: Option<String>,
}

// ─── Helpers ─────────────────────────────────────────────────

/// Build a reqwest client with the standard Notion API headers.
fn notion_client(api_key: &str) -> Result<Client, String> {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", api_key))
            .map_err(|e| format!("Invalid API key header: {}", e))?,
    );
    headers.insert(
        "Notion-Version",
        HeaderValue::from_static("2022-06-28"),
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// Extract a plain-text title from a Notion title property.
fn extract_title(prop: &Value) -> String {
    prop.get("title")
        .and_then(|arr| arr.as_array())
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("plain_text"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

/// Extract a select property value.
fn extract_select(prop: &Value) -> Option<String> {
    prop.get("select")
        .and_then(|s| s.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Extract a rich_text property value as plain text.
fn extract_rich_text(prop: &Value) -> Option<String> {
    prop.get("rich_text")
        .and_then(|arr| arr.as_array())
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("plain_text"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Parse a single Notion result object into a NotionPage.
fn parse_notion_page(page: &Value) -> Option<NotionPage> {
    let id = page.get("id")?.as_str()?.to_string();
    let properties = page.get("properties")?;

    // Try common property names for the title column.
    let title = properties
        .get("Name")
        .or_else(|| properties.get("Title"))
        .or_else(|| properties.get("title"))
        .map(|p| extract_title(p))
        .unwrap_or_default();

    let status = properties
        .get("Status")
        .or_else(|| properties.get("status"))
        .and_then(|p| extract_select(p));

    let priority = properties
        .get("Priority")
        .or_else(|| properties.get("priority"))
        .and_then(|p| extract_select(p));

    let description = properties
        .get("Description")
        .or_else(|| properties.get("description"))
        .and_then(|p| extract_rich_text(p));

    Some(NotionPage {
        id,
        title,
        status,
        priority,
        description,
    })
}

// ─── Public API ──────────────────────────────────────────────

/// Raw query to a Notion database.  Returns all pages (handles
/// pagination internally).
pub async fn query_notion_database(
    api_key: &str,
    database_id: &str,
) -> Result<Vec<NotionPage>, String> {
    let client = notion_client(api_key)?;
    let url = format!(
        "https://api.notion.com/v1/databases/{}/query",
        database_id
    );

    let mut pages: Vec<NotionPage> = Vec::new();
    let mut start_cursor: Option<String> = None;

    loop {
        let mut body = serde_json::json!({});
        if let Some(ref cursor) = start_cursor {
            body["start_cursor"] = serde_json::json!(cursor);
        }

        let resp = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Notion query failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown".to_string());
            return Err(format!("Notion API error ({}): {}", status, body));
        }

        let data: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Notion response: {}", e))?;

        if let Some(results) = data.get("results").and_then(|r| r.as_array()) {
            for result in results {
                if let Some(page) = parse_notion_page(result) {
                    pages.push(page);
                }
            }
        }

        // Handle pagination.
        let has_more = data
            .get("has_more")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if has_more {
            start_cursor = data
                .get("next_cursor")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(pages)
}

/// Update a Notion page's Status property.
pub async fn update_notion_task(
    api_key: &str,
    page_id: &str,
    status: &str,
) -> Result<(), String> {
    let client = notion_client(api_key)?;
    let url = format!("https://api.notion.com/v1/pages/{}", page_id);

    let body = serde_json::json!({
        "properties": {
            "Status": {
                "select": {
                    "name": status
                }
            }
        }
    });

    let resp = client
        .patch(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Notion update failed: {}", e))?;

    if !resp.status().is_success() {
        let status_code = resp.status();
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown".to_string());
        return Err(format!("Notion API error ({}): {}", status_code, body));
    }

    Ok(())
}

/// Query a Notion database and upsert each page into the local
/// SQLite tasks table.  Returns the full list of synced tasks.
pub async fn sync_tasks(
    db: &Mutex<Connection>,
    api_key: &str,
    database_id: &str,
) -> Result<Vec<Task>, String> {
    let notion_pages = query_notion_database(api_key, database_id).await?;

    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;

    for page in &notion_pages {
        // Check if a task with this notion_page_id already exists.
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM tasks WHERE notion_page_id = ?1",
                rusqlite::params![page.id],
                |row| row.get(0),
            )
            .ok();

        if let Some(task_id) = existing {
            // Update the existing task with latest Notion data.
            conn.execute(
                "UPDATE tasks SET title=?1, status=?2, priority=?3, description=?4,
                 updated_at=CURRENT_TIMESTAMP WHERE id=?5",
                rusqlite::params![
                    page.title,
                    page.status.as_deref().unwrap_or("todo"),
                    page.priority.as_deref().unwrap_or("medium"),
                    page.description,
                    task_id,
                ],
            )
            .map_err(|e| format!("Failed to update task: {}", e))?;
        } else {
            // Insert a new task.
            let task = Task {
                id: uuid::Uuid::new_v4().to_string(),
                notion_page_id: Some(page.id.clone()),
                title: page.title.clone(),
                description: page.description.clone(),
                status: page.status.clone().unwrap_or_else(|| "todo".to_string()),
                assigned_agent: None,
                priority: page
                    .priority
                    .clone()
                    .unwrap_or_else(|| "medium".to_string()),
                parent_task_id: None,
                blocked_by: "[]".to_string(),
                created_at: String::new(), // DB default
                updated_at: String::new(), // DB default
            };
            queries::insert_task(&conn, &task)
                .map_err(|e| format!("Failed to insert task: {}", e))?;
        }
    }

    // Return all tasks from the DB.
    let tasks = queries::get_tasks(&conn, None, None)
        .map_err(|e| format!("Failed to get tasks: {}", e))?;

    Ok(tasks)
}
