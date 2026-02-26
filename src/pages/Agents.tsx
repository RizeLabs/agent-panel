import { useState } from "react";
import {
  Bot,
  Plus,
  X,
  Save,
  Loader2,
  Terminal,
  ArrowLeft,
  SendHorizonal,
} from "lucide-react";
import { toast } from "sonner";
import type { Agent, AgentLog, CreateAgentRequest, ModelType, AgentRole } from "../lib/types";
import { cn, statusDotColor, timeAgo } from "../lib/utils";
import { sendAgentInput } from "../lib/tauri";
import {
  useAgents,
  useCreateAgent,
  useUpdateAgent,
  useAgentLogs,
} from "../hooks/useAgents";
import AgentCard from "../components/agents/AgentCard";

export default function Agents() {
  const { data: agents, isLoading } = useAgents();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const handleNewAgent = () => {
    setEditingAgent(null);
    setShowConfig(true);
  };

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgent(agentId);
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setShowConfig(true);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Bot size={22} className="text-panel-accent" />
          <h1 className="text-xl font-semibold text-panel-text">Agents</h1>
          {agents && (
            <span className="text-xs text-panel-text-dim">
              {agents.length} agents
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleNewAgent}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25 transition-colors"
        >
          <Plus size={14} />
          New Agent
        </button>
      </div>

      {/* Main Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Agent List */}
        <div
          className={cn(
            "space-y-2 overflow-y-auto",
            selectedAgent ? "w-1/3 shrink-0" : "flex-1"
          )}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2
                size={20}
                className="text-panel-text-dim animate-spin"
              />
            </div>
          ) : agents && agents.length > 0 ? (
            <div
              className={cn(
                "grid gap-2",
                selectedAgent ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {agents.map((agent: Agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onSelect={handleSelectAgent}
                />
              ))}
            </div>
          ) : (
            <div className="bg-panel-surface border border-panel-border rounded-lg p-8 text-center">
              <Bot
                size={32}
                className="text-panel-text-dim mx-auto mb-3 opacity-40"
              />
              <p className="text-sm text-panel-text-dim">No agents yet</p>
              <p className="text-xs text-panel-text-dim/70 mt-1">
                Create an agent to get started
              </p>
            </div>
          )}
        </div>

        {/* Agent Log Panel */}
        {selectedAgent && (
          <AgentLogPanel
            agentId={selectedAgent}
            agent={agents?.find((a: Agent) => a.id === selectedAgent) ?? null}
            onClose={() => setSelectedAgent(null)}
            onEdit={handleEditAgent}
          />
        )}
      </div>

      {/* Config Modal */}
      {showConfig && (
        <AgentConfigModal
          agent={editingAgent}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}

function AgentLogPanel({
  agentId,
  agent,
  onClose,
  onEdit,
}: {
  agentId: string;
  agent: Agent | null;
  onClose: () => void;
  onEdit: (agent: Agent) => void;
}) {
  const { data: logs, isLoading } = useAgentLogs(agentId);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendInput = async () => {
    const text = inputText.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendAgentInput(agentId, text);
      setInputText("");
    } catch (err) {
      toast.error(`Failed to send input: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const logTypeColors: Record<string, string> = {
    stdout: "text-panel-text",
    stderr: "text-panel-error",
    tool_use: "text-blue-400",
    status_change: "text-panel-warning",
    error: "text-panel-error",
  };

  return (
    <div className="flex-1 flex flex-col bg-panel-surface border border-panel-border rounded-lg overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-panel-border shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="text-panel-text-dim hover:text-panel-text transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <Terminal size={14} className="text-panel-accent" />
        <span className="text-xs font-medium text-panel-text">
          {agent?.name ?? agentId}
        </span>
        {agent && (
          <>
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full ml-1",
                statusDotColor(agent.status)
              )}
            />
            <span className="text-[10px] text-panel-text-dim capitalize">
              {agent.status}
            </span>
            <button
              type="button"
              onClick={() => onEdit(agent)}
              className="ml-auto text-[10px] text-panel-accent hover:text-panel-accent/80 transition-colors"
            >
              Edit
            </button>
          </>
        )}
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2
              size={16}
              className="text-panel-text-dim animate-spin"
            />
          </div>
        ) : logs && logs.length > 0 ? (
          logs.map((log: AgentLog) => (
            <div key={log.id} className="flex gap-2 leading-relaxed">
              <span className="text-[10px] text-panel-text-dim shrink-0 w-12 text-right">
                {new Date(log.created_at).toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span
                className={cn(
                  "text-[10px] shrink-0 w-16 capitalize",
                  logTypeColors[log.log_type] ?? "text-panel-text-dim"
                )}
              >
                [{log.log_type}]
              </span>
              <span className="text-panel-text break-all">{log.content}</span>
            </div>
          ))
        ) : (
          <p className="text-panel-text-dim text-center py-8">
            No logs available
          </p>
        )}
      </div>

      {/* Input bar — visible when agent is running */}
      {agent?.status === "running" && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-panel-border shrink-0">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendInput()}
            placeholder="Send input to agent..."
            disabled={sending}
            className="flex-1 bg-panel-bg border border-panel-border rounded-md px-3 py-1.5 text-xs text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
          />
          <button
            type="button"
            onClick={handleSendInput}
            disabled={sending || !inputText.trim()}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <SendHorizonal size={12} />
            )}
            Send
          </button>
        </div>
      )}
    </div>
  );
}

function AgentConfigModal({
  agent,
  onClose,
}: {
  agent: Agent | null;
  onClose: () => void;
}) {
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

  const [name, setName] = useState(agent?.name ?? "");
  const [role, setRole] = useState<string>(agent?.role ?? "coder");
  const [model, setModel] = useState<string>(agent?.model ?? "sonnet");
  const [systemPrompt, setSystemPrompt] = useState(
    agent?.system_prompt ?? ""
  );
  const [workingDirectory, setWorkingDirectory] = useState(
    agent?.working_directory ?? ""
  );
  const [maxTurns, setMaxTurns] = useState(agent?.max_turns ?? 10);

  const isEditing = !!agent;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const request: CreateAgentRequest = {
      name: name.trim(),
      role,
      model,
      system_prompt: systemPrompt || undefined,
      working_directory: workingDirectory || undefined,
      max_turns: maxTurns,
    };

    if (isEditing) {
      updateAgent.mutate(
        { ...request, id: agent.id },
        { onSuccess: () => onClose() }
      );
    } else {
      createAgent.mutate(request, { onSuccess: () => onClose() });
    }
  };

  const isPending = createAgent.isPending || updateAgent.isPending;

  const roles: AgentRole[] = ["coder", "researcher", "content", "coordinator"];
  const models: ModelType[] = ["opus", "sonnet", "haiku"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-panel-surface border border-panel-border rounded-lg w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-panel-text">
            {isEditing ? "Edit Agent" : "New Agent"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-panel-text-dim hover:text-panel-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Name */}
        <label className="block text-xs text-panel-text-dim mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. code-agent-01"
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3"
        />

        {/* Role + Model row */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-panel-text-dim mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-panel-text-dim mb-1">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Working Directory */}
        <label className="block text-xs text-panel-text-dim mb-1">
          Working Directory
        </label>
        <input
          type="text"
          value={workingDirectory}
          onChange={(e) => setWorkingDirectory(e.target.value)}
          placeholder="/path/to/project"
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3 font-mono"
        />

        {/* Max Turns + Budget */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-panel-text-dim mb-1">
              Max Turns
            </label>
            <input
              type="number"
              min={1}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            />
          </div>
        </div>

        {/* System Prompt */}
        <label className="block text-xs text-panel-text-dim mb-1">
          System Prompt
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Optional system prompt for the agent..."
          rows={4}
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-4 resize-y"
        />

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md text-panel-text-dim hover:text-panel-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || isPending}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            {isPending
              ? "Saving..."
              : isEditing
                ? "Update Agent"
                : "Create Agent"}
          </button>
        </div>
      </form>
    </div>
  );
}
