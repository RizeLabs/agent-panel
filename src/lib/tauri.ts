import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Agent,
  AgentLog,
  AgentLogEvent,
  AgentStatusEvent,
  AgentWaitingEvent,
  CreateAgentRequest,
  CronJob,
  Knowledge,
  Message,
  Settings,
  SkillDefinition,
  Swarm,
  Task,
  UpdateAgentRequest,
} from "./types";

// ─── Agent Commands ───────────────────────────────────────────

export const createAgent = (request: CreateAgentRequest) =>
  invoke<Agent>("create_agent", { request });

export const getAgents = () => invoke<Agent[]>("get_agents");

export const getAgent = (agentId: string) =>
  invoke<Agent>("get_agent", { agentId });

export const updateAgent = (request: UpdateAgentRequest) =>
  invoke<Agent>("update_agent", { request });

export const deleteAgent = (agentId: string) =>
  invoke<void>("delete_agent", { agentId });

export const startAgent = (agentId: string) =>
  invoke<void>("start_agent", { agentId });

export const stopAgent = (agentId: string) =>
  invoke<void>("stop_agent", { agentId });

export const pauseAgent = (agentId: string) =>
  invoke<void>("pause_agent", { agentId });

export const resumeAgent = (
  agentId: string,
  additionalContext?: string
) =>
  invoke<void>("resume_agent", { agentId, additionalContext });

export const sendAgentInput = (agentId: string, input: string) =>
  invoke<void>("send_agent_input", { agentId, input });

export const getAgentLogs = (agentId: string, limit?: number) =>
  invoke<AgentLog[]>("get_agent_logs", { agentId, limit });

// ─── Swarm Commands ───────────────────────────────────────────

export const createSwarm = (request: {
  name: string;
  goal?: string;
  agent_configs: Array<{
    agent_id: string;
    system_prompt?: string;
    skills?: string[];
  }>;
}) => invoke<string>("create_swarm", { request });

export const startSwarm = (swarmId: string) =>
  invoke<void>("start_swarm", { swarmId });

export const stopSwarm = (swarmId: string) =>
  invoke<void>("stop_swarm", { swarmId });

export const deleteSwarm = (swarmId: string) =>
  invoke<void>("delete_swarm", { swarmId });

export const getSwarmStatus = (swarmId: string) =>
  invoke<Swarm>("get_swarm_status", { swarmId });

// ─── Message Commands ─────────────────────────────────────────

export const postMessage = (request: {
  from_agent: string;
  to_agent?: string;
  message_type: string;
  content: string;
  metadata?: string;
}) => invoke<number>("post_message", { request });

export const getMessages = (request?: {
  agent_id?: string;
  message_type?: string;
  limit?: number;
}) => invoke<Message[]>("get_messages", { request: request ?? {} });

export const getKnowledge = (params?: {
  category?: string;
  search?: string;
  limit?: number;
}) =>
  invoke<Knowledge[]>("get_knowledge", params ?? {});

export const addKnowledge = (request: {
  agent_id: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
}) => invoke<number>("add_knowledge", { request });

// ─── Skill Commands ───────────────────────────────────────────

export const listSkills = () =>
  invoke<SkillDefinition[]>("list_skills");

export const getSkill = (name: string) =>
  invoke<SkillDefinition>("get_skill", { name });

export const saveSkill = (skill: SkillDefinition) =>
  invoke<void>("save_skill", { skill });

export const deleteSkill = (name: string) =>
  invoke<void>("delete_skill", { name });

export const assignSkill = (agentId: string, skillName: string) =>
  invoke<void>("assign_skill", { agentId, skillName });

export const importSkillFromUrl = (url: string) =>
  invoke<SkillDefinition>("import_skill_from_url", { url });

export const importSkillsFromPath = (path: string) =>
  invoke<SkillDefinition[]>("import_skills_from_path", { path });

// ─── Task Commands ────────────────────────────────────────────

export const getTasks = (status?: string, assignedAgent?: string) =>
  invoke<Task[]>("get_tasks", { status, assignedAgent });

export const updateTask = (task: Task) =>
  invoke<void>("update_task", { task });

export const createTask = (request: {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigned_agent?: string;
  swarm_id?: string;
}) =>
  invoke<Task>("create_task", {
    title: request.title,
    description: request.description,
    status: request.status,
    priority: request.priority,
    assignedAgent: request.assigned_agent,
    swarmId: request.swarm_id,
  });

export const getSwarms = () => invoke<Swarm[]>("get_swarms");

export const deleteTask = (taskId: string) =>
  invoke<void>("delete_task", { taskId });

export const syncNotion = () => invoke<Task[]>("sync_notion");

// ─── Cron Job Commands ────────────────────────────────────────

export const createCronJob = (request: {
  name: string;
  description?: string;
  interval_secs: number;
  agent_id: string;
  action_type: string;
  payload: string;
}) => invoke<CronJob>("create_cron_job", { request });

export const listCronJobs = () => invoke<CronJob[]>("list_cron_jobs");

export const updateCronJob = (job: CronJob) =>
  invoke<CronJob>("update_cron_job", { job });

export const deleteCronJob = (jobId: string) =>
  invoke<void>("delete_cron_job", { jobId });

export const triggerCronJob = (jobId: string) =>
  invoke<void>("trigger_cron_job", { jobId });

// ─── Settings Commands ────────────────────────────────────────

export const getSettings = () => invoke<Settings>("get_settings");

export const saveSettings = (settings: Record<string, string>) =>
  invoke<void>("save_settings", { settings });

// ─── Telegram Commands ────────────────────────────────────────

export const testTelegram = () => invoke<string>("test_telegram");

export const startTelegramBot = () => invoke<void>("start_telegram_bot");

export const stopTelegramBot = () => invoke<void>("stop_telegram_bot");

// ─── Event Listeners ──────────────────────────────────────────

export const onAgentLog = (
  callback: (event: AgentLogEvent) => void
): Promise<UnlistenFn> =>
  listen<AgentLogEvent>("agent-log", (event) => callback(event.payload));

export const onAgentStatusChange = (
  callback: (event: AgentStatusEvent) => void
): Promise<UnlistenFn> =>
  listen<AgentStatusEvent>("agent-status-change", (event) =>
    callback(event.payload)
  );

export const onAgentWaitingInput = (
  callback: (event: AgentWaitingEvent) => void
): Promise<UnlistenFn> =>
  listen<AgentWaitingEvent>("agent-waiting-input", (event) =>
    callback(event.payload)
  );
