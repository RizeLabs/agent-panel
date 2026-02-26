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
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Swarm, Agent, SkillDefinition } from "../../lib/types";
import { cn, statusDotColor, parseJsonSafe, timeAgo } from "../../lib/utils";
import { useAgents } from "../../hooks/useAgents";
import { listSkills, saveSettings } from "../../lib/tauri";
import { useSettings } from "../../hooks/useSettings";
import {
  useSwarms,
  useCreateSwarm,
  useStartSwarm,
  useStopSwarm,
} from "../../hooks/useSwarm";

export default function SwarmView({
  onSwarmChange,
}: {
  onSwarmChange?: (swarm: Swarm | undefined) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: swarms = [], isLoading } = useSwarms();
  const startSwarm = useStartSwarm();
  const stopSwarm = useStopSwarm();

  // Keep the selected swarm in sync for the graph/other tabs
  const selectedSwarm = swarms.find((s) => s.id === selectedId) ?? null;
  useEffect(() => {
    onSwarmChange?.(selectedSwarm ?? undefined);
  }, [selectedSwarm, onSwarmChange]);

  // Auto-select first running swarm, or just first swarm
  useEffect(() => {
    if (selectedId || swarms.length === 0) return;
    const running = swarms.find((s) => s.status === "running");
    setSelectedId((running ?? swarms[0]).id);
  }, [swarms, selectedId]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={18} className="text-panel-accent" />
          <h2 className="text-base font-semibold text-panel-text">Swarms</h2>
          {swarms.length > 0 && (
            <span className="text-[11px] text-panel-text-dim bg-panel-border/50 rounded-full px-2 py-0.5">
              {swarms.filter((s) => s.status === "running").length} running /{" "}
              {swarms.length} total
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25 transition-colors"
        >
          <Plus size={13} />
          New Swarm
        </button>
      </div>

      {/* Swarm List */}
      {isLoading ? (
        <div className="text-xs text-panel-text-dim py-4 text-center">
          Loading swarms…
        </div>
      ) : swarms.length === 0 ? (
        <div className="bg-panel-surface border border-panel-border rounded-lg p-6 text-center">
          <Network size={28} className="text-panel-text-dim mx-auto mb-2 opacity-40" />
          <p className="text-sm text-panel-text-dim">No swarms yet</p>
          <p className="text-xs text-panel-text-dim/60 mt-0.5">
            Create a swarm to coordinate multiple agents
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {swarms.map((swarm) => (
            <SwarmCard
              key={swarm.id}
              swarm={swarm}
              selected={swarm.id === selectedId}
              onSelect={() =>
                setSelectedId((prev) =>
                  prev === swarm.id ? null : swarm.id
                )
              }
              onStart={() => startSwarm.mutate(swarm.id)}
              onStop={() => stopSwarm.mutate(swarm.id)}
              startPending={startSwarm.isPending}
              stopPending={stopSwarm.isPending}
            />
          ))}
        </div>
      )}

      {/* Create Swarm Modal */}
      {showCreate && (
        <CreateSwarmForm
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setSelectedId(id);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function SwarmCard({
  swarm,
  selected,
  onSelect,
  onStart,
  onStop,
  startPending,
  stopPending,
}: {
  swarm: Swarm;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
  onStop: () => void;
  startPending: boolean;
  stopPending: boolean;
}) {
  const agentIds = parseJsonSafe<string[]>(swarm.agent_ids, []);
  const { data: agents = [] } = useAgents();

  const isRunning = swarm.status === "running";
  const isStopped = swarm.status === "stopped";

  return (
    <div
      className={cn(
        "bg-panel-surface border rounded-lg transition-colors",
        selected ? "border-panel-accent/50" : "border-panel-border"
      )}
    >
      {/* Card header — always visible */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={onSelect}
      >
        {/* Status dot */}
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            isRunning
              ? "bg-panel-success animate-pulse"
              : isStopped
                ? "bg-panel-text-dim/40"
                : "bg-panel-warning"
          )}
        />

        {/* Name + goal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-panel-text truncate">
              {swarm.name}
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize shrink-0",
                isRunning
                  ? "bg-panel-success/15 text-panel-success"
                  : isStopped
                    ? "bg-panel-text-dim/15 text-panel-text-dim"
                    : "bg-panel-warning/15 text-panel-warning"
              )}
            >
              {swarm.status}
            </span>
          </div>
          {swarm.goal && (
            <p className="text-[11px] text-panel-text-dim truncate mt-0.5">
              {swarm.goal}
            </p>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 shrink-0 text-xs text-panel-text-dim">
          <span className="flex items-center gap-1">
            <Users size={11} />
            {agentIds.length}
          </span>
          <span>{timeAgo(swarm.created_at)}</span>
        </div>

        {/* Start / Stop */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              disabled={stopPending}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-panel-error/15 text-panel-error hover:bg-panel-error/25 transition-colors disabled:opacity-50"
            >
              <Square size={11} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={startPending}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-panel-success/15 text-panel-success hover:bg-panel-success/25 transition-colors disabled:opacity-50"
            >
              <Play size={11} />
              Start
            </button>
          )}
        </div>

        {/* Expand chevron */}
        <span className="text-panel-text-dim shrink-0">
          {selected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded detail */}
      {selected && (
        <div className="border-t border-panel-border px-4 py-3 flex flex-col gap-3">
          {swarm.goal && (
            <div className="bg-panel-accent/5 border border-panel-accent/20 rounded-md px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-panel-accent font-semibold">
                Objective
              </span>
              <p className="text-xs text-panel-text mt-0.5 leading-relaxed">
                {swarm.goal}
              </p>
            </div>
          )}

          {/* Agent roster */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-panel-text-dim mb-2">
              <Users size={12} />
              <span>Agents ({agentIds.length})</span>
              {swarm.coordinator_id && (
                <span className="ml-auto text-[10px]">
                  Coordinator:{" "}
                  <span className="text-panel-text font-mono">
                    {agents.find((a) => a.id === swarm.coordinator_id)?.name ??
                      swarm.coordinator_id.slice(0, 8)}
                  </span>
                </span>
              )}
            </div>
            {agentIds.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {agentIds.map((agentId) => (
                  <AgentBadge key={agentId} agentId={agentId} agents={agents} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-panel-text-dim italic">
                No member agents
              </p>
            )}
          </div>

          <div className="text-[11px] text-panel-text-dim font-mono">
            id: {swarm.id}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentBadge({ agentId, agents }: { agentId: string; agents: Agent[] }) {
  const agent = agents.find((a) => a.id === agentId);
  return (
    <div className="flex items-center gap-2 bg-panel-bg border border-panel-border rounded-md px-2.5 py-1.5 text-xs">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          statusDotColor(agent?.status ?? "idle")
        )}
      />
      <span className="text-panel-text truncate">
        {agent?.name ?? agentId.slice(0, 8)}
      </span>
      {agent && (
        <span className="ml-auto text-panel-text-dim capitalize text-[10px] shrink-0">
          {agent.role}
        </span>
      )}
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
              Optionally configure Telegram for this swarm. Credentials are saved
              to your app settings and shared across all swarms.
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
