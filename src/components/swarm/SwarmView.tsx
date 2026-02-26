import { useState, useEffect } from "react";
import {
  Play,
  Square,
  Network,
  Plus,
  Users,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Send,
  BookOpen,
  Eye,
  EyeOff,
} from "lucide-react";
import type { Swarm, Agent, SkillDefinition } from "../../lib/types";
import { cn, statusDotColor, parseJsonSafe, timeAgo } from "../../lib/utils";
import { useAgents } from "../../hooks/useAgents";
import { listSkills, saveSettings } from "../../lib/tauri";
import { useSettings } from "../../hooks/useSettings";
import {
  useSwarmStatus,
  useCreateSwarm,
  useStartSwarm,
  useStopSwarm,
} from "../../hooks/useSwarm";

export default function SwarmView() {
  const [swarmId, setSwarmId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: swarm } = useSwarmStatus(swarmId ?? "");
  const startSwarm = useStartSwarm();
  const stopSwarm = useStopSwarm();

  const agents = swarm ? parseJsonSafe<string[]>(swarm.agent_ids, []) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-panel-accent" />
          <h2 className="text-lg font-semibold text-panel-text">Swarm</h2>
          {swarm && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                swarm.status === "running"
                  ? "bg-panel-success/15 text-panel-success"
                  : swarm.status === "paused"
                    ? "bg-panel-warning/15 text-panel-warning"
                    : "bg-panel-text-dim/15 text-panel-text-dim"
              )}
            >
              {swarm.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {swarm && swarm.status !== "running" && (
            <button
              type="button"
              onClick={() => startSwarm.mutate(swarm.id)}
              disabled={startSwarm.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-success/15 text-panel-success hover:bg-panel-success/25 transition-colors"
            >
              <Play size={14} />
              Start Swarm
            </button>
          )}
          {swarm && swarm.status === "running" && (
            <button
              type="button"
              onClick={() => stopSwarm.mutate(swarm.id)}
              disabled={stopSwarm.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-error/15 text-panel-error hover:bg-panel-error/25 transition-colors"
            >
              <Square size={14} />
              Stop Swarm
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25 transition-colors"
          >
            <Plus size={14} />
            Create Swarm
          </button>
        </div>
      </div>

      {/* Swarm Info */}
      {swarm ? (
        <div className="bg-panel-surface border border-panel-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-medium text-panel-text">
              {swarm.name}
            </h3>
            <span className="text-[11px] text-panel-text-dim font-mono">
              {swarm.id}
            </span>
          </div>
          {swarm.goal && (
            <div className="bg-panel-accent/5 border border-panel-accent/20 rounded-md px-3 py-2 mb-3">
              <span className="text-[10px] uppercase tracking-wider text-panel-accent font-semibold">
                Objective
              </span>
              <p className="text-xs text-panel-text mt-0.5 leading-relaxed">
                {swarm.goal}
              </p>
            </div>
          )}
          <div className="text-xs text-panel-text-dim mb-3">
            Created {timeAgo(swarm.created_at)}
            {swarm.coordinator_id && (
              <span className="ml-3">
                Coordinator:{" "}
                <span className="text-panel-text">{swarm.coordinator_id}</span>
              </span>
            )}
          </div>

          {/* Agent List */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-panel-text-dim mb-2">
              <Users size={13} />
              <span>Agents ({agents.length})</span>
            </div>
            {agents.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {agents.map((agentId) => (
                  <AgentBadge key={agentId} agentId={agentId} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-panel-text-dim italic">
                No agents in swarm
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-panel-surface border border-panel-border rounded-lg p-8 text-center">
          <Network
            size={32}
            className="text-panel-text-dim mx-auto mb-3 opacity-40"
          />
          <p className="text-sm text-panel-text-dim">No swarm selected</p>
          <p className="text-xs text-panel-text-dim/70 mt-1">
            Create a swarm to coordinate multiple agents
          </p>
        </div>
      )}

      {/* Create Swarm Modal */}
      {showCreate && (
        <CreateSwarmForm
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setSwarmId(id);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function AgentBadge({ agentId }: { agentId: string }) {
  return (
    <div className="flex items-center gap-2 bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-xs">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-panel-text-dim" />
      <span className="text-panel-text font-mono truncate">{agentId}</span>
    </div>
  );
}

interface AgentConfigState {
  system_prompt: string;
  skills: string[];
}

interface IntegrationState {
  telegram_bot_token: string;
  telegram_chat_id: string;
  notion_api_key: string;
  notion_database_id: string;
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 pr-9 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-panel-text-dim hover:text-panel-text transition-colors"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function CreateSwarmForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [agentConfigs, setAgentConfigs] = useState<
    Record<string, AgentConfigState>
  >({});
  const [availableSkills, setAvailableSkills] = useState<SkillDefinition[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationState>({
    telegram_bot_token: "",
    telegram_chat_id: "",
    notion_api_key: "",
    notion_database_id: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const { data: agents } = useAgents();
  const { data: settings } = useSettings();
  const createSwarm = useCreateSwarm();

  // Fetch available skills when entering step 2
  useEffect(() => {
    if (step === 2) {
      listSkills().then(setAvailableSkills).catch(() => {});
    }
  }, [step]);

  // Pre-fill integrations from existing settings when entering step 3
  useEffect(() => {
    if (step === 3 && settings?.values) {
      setIntegrations((prev) => ({
        telegram_bot_token:
          prev.telegram_bot_token || settings.values.telegram_bot_token || "",
        telegram_chat_id:
          prev.telegram_chat_id || settings.values.telegram_chat_id || "",
        notion_api_key:
          prev.notion_api_key || settings.values.notion_api_key || "",
        notion_database_id:
          prev.notion_database_id || settings.values.notion_database_id || "",
      }));
    }
  }, [step, settings]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const goToStep2 = () => {
    if (!name.trim() || selectedAgents.length === 0) return;
    // Initialize per-agent config from current agent state
    const configs: Record<string, AgentConfigState> = {};
    for (const agentId of selectedAgents) {
      const agent = agents?.find((a) => a.id === agentId);
      configs[agentId] = {
        system_prompt: agent?.system_prompt ?? "",
        skills: parseJsonSafe<string[]>(agent?.skills ?? "[]", []),
      };
    }
    setAgentConfigs(configs);
    setStep(2);
  };

  const updateAgentConfig = (
    agentId: string,
    field: keyof AgentConfigState,
    value: string | string[]
  ) => {
    setAgentConfigs((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [field]: value },
    }));
  };

  const toggleSkill = (agentId: string, skillName: string) => {
    setAgentConfigs((prev) => {
      const current = prev[agentId].skills;
      const updated = current.includes(skillName)
        ? current.filter((s) => s !== skillName)
        : [...current, skillName];
      return { ...prev, [agentId]: { ...prev[agentId], skills: updated } };
    });
  };

  const updateIntegration = (
    field: keyof IntegrationState,
    value: string
  ) => {
    setIntegrations((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Save integration settings if any were provided
      const settingsToSave: Record<string, string> = {};
      if (integrations.telegram_bot_token.trim())
        settingsToSave.telegram_bot_token = integrations.telegram_bot_token.trim();
      if (integrations.telegram_chat_id.trim())
        settingsToSave.telegram_chat_id = integrations.telegram_chat_id.trim();
      if (integrations.notion_api_key.trim())
        settingsToSave.notion_api_key = integrations.notion_api_key.trim();
      if (integrations.notion_database_id.trim())
        settingsToSave.notion_database_id = integrations.notion_database_id.trim();

      if (Object.keys(settingsToSave).length > 0) {
        await saveSettings(settingsToSave);
      }

      // Build agent configs and create swarm
      const agent_configs = selectedAgents.map((agentId) => {
        const config = agentConfigs[agentId];
        return {
          agent_id: agentId,
          system_prompt: config?.system_prompt || undefined,
          skills: config?.skills.length ? config.skills : undefined,
        };
      });

      createSwarm.mutate(
        {
          name: name.trim(),
          goal: goal.trim() || undefined,
          agent_configs,
        },
        {
          onSuccess: (id) => onCreated(id),
          onSettled: () => setSubmitting(false),
        }
      );
    } catch {
      setSubmitting(false);
    }
  };

  const stepLabels = ["Setup", "Agents", "Integrations"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-panel-surface border border-panel-border rounded-lg w-full max-w-lg p-5 shadow-xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-panel-text">
              Create Swarm
            </h3>
            <span className="text-[10px] text-panel-text-dim px-1.5 py-0.5 rounded bg-panel-bg border border-panel-border">
              Step {step}/3
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-panel-text-dim hover:text-panel-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {stepLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  "h-1 rounded-full flex-1 transition-colors",
                  i + 1 <= step
                    ? "bg-panel-accent"
                    : "bg-panel-border"
                )}
              />
              <span
                className={cn(
                  "text-[10px] shrink-0",
                  i + 1 <= step
                    ? "text-panel-accent"
                    : "text-panel-text-dim"
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {step === 1 ? (
          /* ─── Step 1: Setup ─── */
          <div className="flex-1 overflow-y-auto">
            {/* Name Input */}
            <label className="block text-xs text-panel-text-dim mb-1">
              Swarm Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Squad"
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-4"
            />

            {/* Goal Input */}
            <label className="block text-xs text-panel-text-dim mb-1">
              Collective Goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Research and implement a DeFi yield aggregator with optimal gas efficiency"
              rows={3}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-4 resize-none"
            />
            <p className="text-[10px] text-panel-text-dim/60 -mt-3 mb-4">
              The objective function all agents in this swarm will optimise
              towards.
            </p>

            {/* Agent Multiselect */}
            <label className="block text-xs text-panel-text-dim mb-2">
              Select Agents
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 mb-4 bg-panel-bg border border-panel-border rounded-md p-2">
              {agents && agents.length > 0 ? (
                agents.map((agent: Agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left",
                      selectedAgents.includes(agent.id)
                        ? "bg-panel-accent/15 text-panel-accent"
                        : "text-panel-text hover:bg-panel-border/50"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        selectedAgents.includes(agent.id)
                          ? "border-panel-accent bg-panel-accent"
                          : "border-panel-border"
                      )}
                    >
                      {selectedAgents.includes(agent.id) && (
                        <Check size={10} className="text-white" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        statusDotColor(agent.status)
                      )}
                    />
                    <span className="truncate">{agent.name}</span>
                    <span className="ml-auto text-panel-text-dim text-[10px] capitalize">
                      {agent.role}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-panel-text-dim text-center py-2">
                  No agents available
                </p>
              )}
            </div>
          </div>
        ) : step === 2 ? (
          /* ─── Step 2: Configure Agents ─── */
          <div className="flex-1 overflow-y-auto space-y-4">
            {selectedAgents.map((agentId) => {
              const agent = agents?.find((a) => a.id === agentId);
              const config = agentConfigs[agentId];
              if (!config) return null;

              return (
                <div
                  key={agentId}
                  className="bg-panel-bg border border-panel-border rounded-md p-3"
                >
                  {/* Agent header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        statusDotColor(agent?.status ?? "idle")
                      )}
                    />
                    <span className="text-xs font-medium text-panel-text">
                      {agent?.name ?? agentId}
                    </span>
                    <span className="text-[10px] text-panel-text-dim capitalize">
                      {agent?.role}
                    </span>
                  </div>

                  {/* System prompt */}
                  <label className="block text-[11px] text-panel-text-dim mb-1">
                    System Prompt
                  </label>
                  <textarea
                    value={config.system_prompt}
                    onChange={(e) =>
                      updateAgentConfig(agentId, "system_prompt", e.target.value)
                    }
                    rows={4}
                    placeholder="System prompt for this agent's role in the swarm..."
                    className="w-full bg-panel-surface border border-panel-border rounded-md px-2.5 py-1.5 text-xs text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3 resize-none font-mono"
                  />

                  {/* Skills */}
                  <label className="block text-[11px] text-panel-text-dim mb-1.5">
                    Skills
                  </label>
                  {availableSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {availableSkills.map((skill) => (
                        <button
                          key={skill.name}
                          type="button"
                          onClick={() => toggleSkill(agentId, skill.name)}
                          className={cn(
                            "text-[11px] px-2 py-1 rounded-md border transition-colors",
                            config.skills.includes(skill.name)
                              ? "border-panel-accent bg-panel-accent/15 text-panel-accent"
                              : "border-panel-border text-panel-text-dim hover:border-panel-text-dim"
                          )}
                          title={skill.description}
                        >
                          {skill.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-panel-text-dim/60 italic">
                      No skills available
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ─── Step 3: Integrations ─── */
          <div className="flex-1 overflow-y-auto space-y-4">
            <p className="text-[11px] text-panel-text-dim">
              Optionally configure integrations for this swarm. These credentials
              are saved to your app settings and shared across all swarms.
            </p>

            {/* Telegram */}
            <div className="bg-panel-bg border border-panel-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-3">
                <Send size={14} className="text-[#2AABEE]" />
                <span className="text-xs font-medium text-panel-text">
                  Telegram
                </span>
              </div>

              <label className="block text-[11px] text-panel-text-dim mb-1">
                Bot Token
              </label>
              <div className="mb-3">
                <SecretInput
                  value={integrations.telegram_bot_token}
                  onChange={(v) => updateIntegration("telegram_bot_token", v)}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                />
              </div>
              <p className="text-[10px] text-panel-text-dim/60 -mt-2 mb-3">
                Get this from{" "}
                <span className="text-panel-accent">@BotFather</span> on
                Telegram.
              </p>

              <label className="block text-[11px] text-panel-text-dim mb-1">
                Chat ID
              </label>
              <input
                type="text"
                value={integrations.telegram_chat_id}
                onChange={(e) =>
                  updateIntegration("telegram_chat_id", e.target.value)
                }
                placeholder="-1001234567890"
                className="w-full bg-panel-surface border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
              />
            </div>

            {/* Notion */}
            <div className="bg-panel-bg border border-panel-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={14} className="text-panel-text" />
                <span className="text-xs font-medium text-panel-text">
                  Notion
                </span>
              </div>

              <label className="block text-[11px] text-panel-text-dim mb-1">
                API Key
              </label>
              <div className="mb-3">
                <SecretInput
                  value={integrations.notion_api_key}
                  onChange={(v) => updateIntegration("notion_api_key", v)}
                  placeholder="ntn_..."
                />
              </div>
              <p className="text-[10px] text-panel-text-dim/60 -mt-2 mb-3">
                Create an internal integration at{" "}
                <span className="text-panel-accent">
                  notion.so/my-integrations
                </span>
                .
              </p>

              <label className="block text-[11px] text-panel-text-dim mb-1">
                Database ID
              </label>
              <input
                type="text"
                value={integrations.notion_database_id}
                onChange={(e) =>
                  updateIntegration("notion_database_id", e.target.value)
                }
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full bg-panel-surface border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-panel-border">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md text-panel-text-dim hover:text-panel-text transition-colors"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-md text-panel-text-dim hover:text-panel-text transition-colors"
            >
              Cancel
            </button>
            {step === 1 ? (
              <button
                type="button"
                onClick={goToStep2}
                disabled={!name.trim() || selectedAgents.length === 0}
                className="flex items-center gap-1 text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={14} />
              </button>
            ) : step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-1 text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || createSwarm.isPending}
                className="text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting || createSwarm.isPending
                  ? "Creating..."
                  : "Create Swarm"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
