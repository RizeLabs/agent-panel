import { useState } from "react";
import {
  Play,
  Square,
  Network,
  Plus,
  Users,
  X,
  Check,
} from "lucide-react";
import type { Swarm, Agent } from "../../lib/types";
import { cn, statusDotColor, parseJsonSafe, timeAgo } from "../../lib/utils";
import { useAgents } from "../../hooks/useAgents";
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

function CreateSwarmForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const { data: agents } = useAgents();
  const createSwarm = useCreateSwarm();

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedAgents.length === 0) return;
    createSwarm.mutate(
      {
        name: name.trim(),
        agent_ids: selectedAgents,
        goal: goal.trim() || undefined,
      },
      {
        onSuccess: (id) => onCreated(id),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-panel-surface border border-panel-border rounded-lg w-full max-w-md p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-panel-text">
            Create Swarm
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-panel-text-dim hover:text-panel-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

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
          The objective function all agents in this swarm will optimise towards.
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
            disabled={
              !name.trim() ||
              selectedAgents.length === 0 ||
              createSwarm.isPending
            }
            className="text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {createSwarm.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
