use serde::{Deserialize, Serialize};
use std::path::Path;

// ─── Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub name: String,
    pub description: String,
    pub triggers: Vec<String>,
    pub instructions: String,
    pub tags: Vec<String>,
}

// ─── Frontmatter Parsing ─────────────────────────────────────

/// Parse a SKILL.md file.  The expected format is YAML-style
/// frontmatter between `---` delimiters, followed by a markdown
/// body that becomes the `instructions` field.
///
/// Frontmatter keys (one per line, `key: value`):
///   name, description, triggers (comma-separated), tags (comma-separated)
pub fn parse_skill_md(content: &str) -> Result<SkillDefinition, String> {
    let trimmed = content.trim();

    // Split on the `---` delimiters.
    if !trimmed.starts_with("---") {
        return Err("SKILL.md must start with '---' frontmatter delimiter".to_string());
    }

    // Find the closing `---` (skip the opening one).
    let after_opening = &trimmed[3..];
    let closing_idx = after_opening
        .find("\n---")
        .ok_or_else(|| "Missing closing '---' frontmatter delimiter".to_string())?;

    let frontmatter = after_opening[..closing_idx].trim();
    // +4 accounts for the "\n---" we matched on.
    let body = after_opening[closing_idx + 4..].trim();

    // Parse frontmatter key: value lines.
    let mut name = String::new();
    let mut description = String::new();
    let mut triggers: Vec<String> = Vec::new();
    let mut tags: Vec<String> = Vec::new();

    for line in frontmatter.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();

            match key {
                "name" => name = value.to_string(),
                "description" => description = value.to_string(),
                "triggers" => {
                    triggers = value
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
                "tags" => {
                    tags = value
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
                _ => {
                    log::warn!("Unknown frontmatter key: {}", key);
                }
            }
        }
    }

    if name.is_empty() {
        return Err("SKILL.md frontmatter must include a 'name' field".to_string());
    }

    Ok(SkillDefinition {
        name,
        description,
        triggers,
        instructions: body.to_string(),
        tags,
    })
}

/// Render a SkillDefinition back to SKILL.md format.
pub fn render_skill_md(skill: &SkillDefinition) -> String {
    let mut output = String::new();

    output.push_str("---\n");
    output.push_str(&format!("name: {}\n", skill.name));
    output.push_str(&format!("description: {}\n", skill.description));
    output.push_str(&format!("triggers: {}\n", skill.triggers.join(", ")));
    output.push_str(&format!("tags: {}\n", skill.tags.join(", ")));
    output.push_str("---\n\n");
    output.push_str(&skill.instructions);

    // Ensure trailing newline.
    if !output.ends_with('\n') {
        output.push('\n');
    }

    output
}

// ─── File Operations ─────────────────────────────────────────

/// Scan a directory for `*.md` files and parse each as a SKILL.md.
/// Files that fail to parse are logged and skipped.
pub fn list_skills(skills_dir: &str) -> Result<Vec<SkillDefinition>, String> {
    let dir = Path::new(skills_dir);

    if !dir.exists() {
        return Ok(Vec::new());
    }

    if !dir.is_dir() {
        return Err(format!("{} is not a directory", skills_dir));
    }

    let mut skills = Vec::new();

    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", skills_dir, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("Failed to read {}: {}", path.display(), e);
                    continue;
                }
            };

            match parse_skill_md(&content) {
                Ok(skill) => skills.push(skill),
                Err(e) => {
                    log::warn!("Failed to parse {}: {}", path.display(), e);
                }
            }
        }
    }

    // Sort by name for deterministic output.
    skills.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(skills)
}

/// Read a specific skill file by name.  The file is expected at
/// `{skills_dir}/{name}.md`.
pub fn get_skill(skills_dir: &str, name: &str) -> Result<SkillDefinition, String> {
    let path = Path::new(skills_dir).join(format!("{}.md", name));

    if !path.exists() {
        return Err(format!("Skill '{}' not found at {}", name, path.display()));
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    parse_skill_md(&content)
}

/// Write (create or update) a SKILL.md file.  The file is written
/// to `{skills_dir}/{skill.name}.md`.
pub fn save_skill(skills_dir: &str, skill: &SkillDefinition) -> Result<(), String> {
    let dir = Path::new(skills_dir);

    // Ensure the directory exists.
    if !dir.exists() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory {}: {}", skills_dir, e))?;
    }

    let path = dir.join(format!("{}.md", skill.name));
    let content = render_skill_md(skill);

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;

    log::info!("Saved skill '{}' to {}", skill.name, path.display());
    Ok(())
}

/// Delete a skill file.
pub fn delete_skill(skills_dir: &str, name: &str) -> Result<(), String> {
    let path = Path::new(skills_dir).join(format!("{}.md", name));

    if !path.exists() {
        return Err(format!("Skill '{}' not found at {}", name, path.display()));
    }

    std::fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete {}: {}", path.display(), e))?;

    log::info!("Deleted skill '{}' from {}", name, path.display());
    Ok(())
}

// ─── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip_skill_md() {
        let skill = SkillDefinition {
            name: "code-review".to_string(),
            description: "Review code for quality and correctness".to_string(),
            triggers: vec!["review".to_string(), "pr".to_string()],
            instructions: "## Instructions\n\nReview the code carefully.\n".to_string(),
            tags: vec!["dev".to_string(), "quality".to_string()],
        };

        let rendered = render_skill_md(&skill);
        let parsed = parse_skill_md(&rendered).expect("Should parse rendered skill");

        assert_eq!(parsed.name, skill.name);
        assert_eq!(parsed.description, skill.description);
        assert_eq!(parsed.triggers, skill.triggers);
        assert_eq!(parsed.tags, skill.tags);
        assert_eq!(parsed.instructions.trim(), skill.instructions.trim());
    }

    #[test]
    fn test_parse_missing_frontmatter() {
        let result = parse_skill_md("No frontmatter here");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_missing_name() {
        let content = "---\ndescription: test\n---\nBody text\n";
        let result = parse_skill_md(content);
        assert!(result.is_err());
    }
}
