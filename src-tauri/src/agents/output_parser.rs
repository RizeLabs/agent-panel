use serde::Serialize;

/// Events parsed from the `claude --output-format stream-json` stdout stream.
/// Each line of output is a JSON object with a `type` field that determines the variant.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    /// Agent produced text output (type: "assistant", content in message.content[].text)
    AssistantText { text: String },

    /// Agent is invoking a tool (type: "tool_use")
    ToolUse {
        tool_name: String,
        tool_input: String,
    },

    /// Final result summary (type: "result")
    Result {
        cost_usd: Option<f64>,
        session_id: Option<String>,
        duration_ms: Option<u64>,
    },

    /// Error from the CLI (type: "error")
    Error { message: String },

    /// System-level message (type: "system")
    SystemMessage { message: String },
}

/// Parse a single JSON line from the claude stream-json output.
///
/// Returns `None` if the line is empty, not valid JSON, or has an unrecognized type.
pub fn parse_stream_line(line: &str) -> Option<StreamEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    let obj = value.as_object()?;
    let event_type = obj.get("type")?.as_str()?;

    match event_type {
        "assistant" => {
            // message.content is an array of text and tool_use content blocks.
            // Both are captured: text blocks as-is, tool_use blocks as a formatted line.
            let message = obj.get("message")?;
            let content = message.get("content")?.as_array()?;

            let mut text_parts: Vec<String> = Vec::new();
            for block in content {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            text_parts.push(text.to_string());
                        }
                    }
                    "tool_use" => {
                        let name = block
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown");
                        let input = block
                            .get("input")
                            .map(|i| serde_json::to_string(i).unwrap_or_default())
                            .unwrap_or_default();
                        text_parts.push(format!("[Tool: {}] {}", name, input));
                    }
                    _ => {
                        // Fallback: try to extract a text field from unknown block types
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            text_parts.push(text.to_string());
                        }
                    }
                }
            }

            if text_parts.is_empty() {
                return None;
            }

            Some(StreamEvent::AssistantText {
                text: text_parts.join("\n"),
            })
        }

        "tool_use" => {
            // Top-level tool_use event: name and input are at the top level of the object,
            // NOT nested under a "tool" key.
            let tool_name = obj
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("unknown")
                .to_string();

            // tool_input may be an object or string; serialize it for storage
            let tool_input = match obj.get("input") {
                Some(input) => {
                    if let Some(s) = input.as_str() {
                        s.to_string()
                    } else {
                        serde_json::to_string(input).unwrap_or_default()
                    }
                }
                None => String::new(),
            };

            Some(StreamEvent::ToolUse {
                tool_name,
                tool_input,
            })
        }

        "result" => {
            // Result fields are at the top level of the event object,
            // NOT nested under a "result" key.
            let cost_usd = obj.get("cost_usd").and_then(|v| v.as_f64());
            let session_id = obj
                .get("session_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let duration_ms = obj.get("duration_ms").and_then(|v| v.as_u64());

            Some(StreamEvent::Result {
                cost_usd,
                session_id,
                duration_ms,
            })
        }

        "error" => {
            let error = obj.get("error")?;
            let message = error
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error")
                .to_string();

            Some(StreamEvent::Error { message })
        }

        "system" => {
            let message = obj
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();

            Some(StreamEvent::SystemMessage { message })
        }

        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_assistant_text() {
        let line = r#"{"type":"assistant","message":{"content":[{"text":"Hello, world!"}]}}"#;
        match parse_stream_line(line) {
            Some(StreamEvent::AssistantText { text }) => {
                assert_eq!(text, "Hello, world!");
            }
            other => panic!("Expected AssistantText, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_tool_use() {
        let line = r#"{"type":"tool_use","tool":{"name":"bash","input":{"command":"ls -la"}}}"#;
        match parse_stream_line(line) {
            Some(StreamEvent::ToolUse {
                tool_name,
                tool_input,
            }) => {
                assert_eq!(tool_name, "bash");
                assert!(tool_input.contains("ls -la"));
            }
            other => panic!("Expected ToolUse, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_result() {
        let line = r#"{"type":"result","result":{"cost_usd":0.05,"session_id":"abc-123","duration_ms":5000}}"#;
        match parse_stream_line(line) {
            Some(StreamEvent::Result {
                cost_usd,
                session_id,
                duration_ms,
            }) => {
                assert_eq!(cost_usd, Some(0.05));
                assert_eq!(session_id, Some("abc-123".to_string()));
                assert_eq!(duration_ms, Some(5000));
            }
            other => panic!("Expected Result, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_error() {
        let line = r#"{"type":"error","error":{"message":"Something went wrong"}}"#;
        match parse_stream_line(line) {
            Some(StreamEvent::Error { message }) => {
                assert_eq!(message, "Something went wrong");
            }
            other => panic!("Expected Error, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_empty_line() {
        assert!(parse_stream_line("").is_none());
        assert!(parse_stream_line("   ").is_none());
    }

    #[test]
    fn test_parse_invalid_json() {
        assert!(parse_stream_line("not json").is_none());
    }

    #[test]
    fn test_parse_unknown_type() {
        let line = r#"{"type":"unknown_event","data":"something"}"#;
        assert!(parse_stream_line(line).is_none());
    }
}
