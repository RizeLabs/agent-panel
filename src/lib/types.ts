// ─── Agent Types ──────────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "paused" | "error" | "stopped";
export type AgentRole =
  | "coder"
  | "researcher"
  | "content"
  | "coordinator"
  | string;
export type ModelType = "opus" | "sonnet" | "haiku";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  system_prompt: string | null;
  working_directory: string | null;
  model: ModelType;
  max_turns: number;
  max_budget_usd: number | null;
  skills: string; // JSON array
  env_vars: string; // JSON object
  status: AgentStatus;
  pid: number | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRequest {
  name: string;
  role: string;
  system_prompt?: string;
  working_directory?: string;
  model?: string;
  max_turns?: number;
  max_budget_usd?: number;
  skills?: string[];
  env_vars?: Record<string, string>;
}

export interface UpdateAgentRequest extends CreateAgentRequest {
  id: string;
}

// ─── Message Types ────────────────────────────────────────────

export type MessageType =
  | "insight"
  | "question"
  | "task_update"
  | "finding"
  | "request"
  | "response";

export interface Message {
  id: number;
  from_agent: string;
  to_agent: string | null;
  message_type: MessageType;
  content: string;
  metadata: string | null;
  read_by: string;
  created_at: string;
}

// ─── Knowledge Types ──────────────────────────────────────────

export type KnowledgeCategory =
  | "research"
  | "code_pattern"
  | "bug"
  | "decision"
  | "insight";

export interface Knowledge {
  id: number;
  agent_id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string;
  relevance_score: number;
  created_at: string;
}

// ─── Task Types ───────────────────────────────────────────────

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  notion_page_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_agent: string | null;
  priority: TaskPriority;
  parent_task_id: string | null;
  blocked_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Swarm Types ──────────────────────────────────────────────

export type SwarmStatus = "stopped" | "running" | "paused";

export interface Swarm {
  id: string;
  name: string;
  agent_ids: string; // JSON array
  coordinator_id: string | null;
  status: SwarmStatus;
  created_at: string;
}

// ─── Skill Types ──────────────────────────────────────────────

export interface SkillDefinition {
  name: string;
  description: string;
  triggers: string[];
  instructions: string;
  tags: string[];
}

// ─── Settings Types ───────────────────────────────────────────

export interface Settings {
  values: Record<string, string>;
}

// ─── Log Types ────────────────────────────────────────────────

export type LogType =
  | "stdout"
  | "stderr"
  | "tool_use"
  | "status_change"
  | "error";

export interface AgentLog {
  id: number;
  agent_id: string;
  log_type: LogType;
  content: string;
  created_at: string;
}

// ─── Event Payloads ───────────────────────────────────────────

export interface AgentLogEvent {
  agent_id: string;
  log_type: LogType;
  content: string;
}

export interface AgentStatusEvent {
  agent_id: string;
  status: AgentStatus;
}
