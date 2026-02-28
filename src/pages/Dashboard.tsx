import {
  Bot,
  Play,
  Square,
  Activity,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Zap,
} from "lucide-react";
import type { Agent, Message } from "../lib/types";
import { cn, statusDotColor, timeAgo } from "../lib/utils";
import { useAgents, useStartAgent, useStopAgent } from "../hooks/useAgents";
import { useMessages } from "../hooks/useMessages";

export default function Dashboard() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: messages, isLoading: messagesLoading } = useMessages();
  const startAgent = useStartAgent();
  const stopAgent = useStopAgent();

  const totalAgents = agents?.length ?? 0;
  const runningAgents =
    agents?.filter((a: Agent) => a.status === "running").length ?? 0;
  const errorAgents =
    agents?.filter((a: Agent) => a.status === "error").length ?? 0;

  const recentMessages = messages?.slice(0, 10) ?? [];

  const handleStartAll = () => {
    if (!agents) return;
    agents
      .filter(
        (a: Agent) =>
          a.status === "idle" ||
          a.status === "stopped" ||
          a.status === "error"
      )
      .forEach((a: Agent) => startAgent.mutate(a.id));
  };

  const handleStopAll = () => {
    if (!agents) return;
    agents
      .filter(
        (a: Agent) => a.status === "running" || a.status === "paused"
      )
      .forEach((a: Agent) => stopAgent.mutate(a.id));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Activity size={22} className="text-panel-accent" />
        <h1 className="text-xl font-semibold text-panel-text">Dashboard</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          icon={Bot}
          label="Total Agents"
          value={totalAgents}
          loading={agentsLoading}
          color="text-panel-accent"
          bgColor="bg-panel-accent/10"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Running"
          value={runningAgents}
          loading={agentsLoading}
          color="text-panel-success"
          bgColor="bg-panel-success/10"
        />
        <SummaryCard
          icon={AlertCircle}
          label="Errors"
          value={errorAgents}
          loading={agentsLoading}
          color="text-panel-error"
          bgColor="bg-panel-error/10"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-panel-surface border border-panel-border rounded-lg p-4">
        <h2 className="text-sm font-medium text-panel-text mb-3 flex items-center gap-2">
          <Zap size={15} className="text-panel-accent" />
          Quick Actions
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartAll}
            disabled={startAgent.isPending || totalAgents === 0}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-md bg-panel-success/15 text-panel-success hover:bg-panel-success/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={14} />
            Start All Agents
          </button>
          <button
            type="button"
            onClick={handleStopAll}
            disabled={stopAgent.isPending || runningAgents === 0}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-md bg-panel-error/15 text-panel-error hover:bg-panel-error/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Square size={14} />
            Stop All Agents
          </button>
        </div>
      </div>

      {/* Agent Status Overview */}
      {agents && agents.length > 0 && (
        <div className="bg-panel-surface border border-panel-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-panel-text mb-3 flex items-center gap-2">
            <Bot size={15} className="text-panel-accent" />
            Agent Status
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {agents.map((agent: Agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 bg-panel-bg border border-panel-border rounded-md px-3 py-2"
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    statusDotColor(agent.status)
                  )}
                />
                <span className="text-xs text-panel-text truncate flex-1">
                  {agent.name}
                </span>
                <span
                  className={cn(
                    "text-[10px] capitalize",
                    agent.status === "running" && "text-panel-success",
                    agent.status === "error" && "text-panel-error",
                    agent.status === "paused" && "text-panel-warning",
                    (agent.status === "idle" || agent.status === "stopped") &&
                      "text-panel-text-dim"
                  )}
                >
                  {agent.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-panel-surface border border-panel-border rounded-lg p-4">
        <h2 className="text-sm font-medium text-panel-text mb-3 flex items-center gap-2">
          <Activity size={15} className="text-panel-accent" />
          Recent Activity
        </h2>
        {messagesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2
              size={18}
              className="text-panel-text-dim animate-spin"
            />
          </div>
        ) : recentMessages.length > 0 ? (
          <div className="space-y-2">
            {recentMessages.map((msg: Message) => {
              const agent = agents?.find((a: Agent) => a.id === msg.from_agent);
              const displayName = agent?.name ?? msg.from_agent;
              return (
              <div
                key={msg.id}
                className="flex items-start gap-3 bg-panel-bg border border-panel-border rounded-md px-3 py-2"
              >
                <span className="text-[11px] text-panel-accent font-medium shrink-0 max-w-[100px] truncate" title={displayName}>
                  {displayName}
                </span>
                <span className="text-[10px] bg-panel-border/50 text-panel-text-dim rounded px-1.5 py-0.5 shrink-0 capitalize">
                  {msg.message_type.replace("_", " ")}
                </span>
                <span className="text-xs text-panel-text flex-1 truncate">
                  {msg.content}
                </span>
                <span className="text-[10px] text-panel-text-dim shrink-0">
                  {timeAgo(msg.created_at)}
                </span>
              </div>
            );
            })}
          </div>
        ) : (
          <p className="text-xs text-panel-text-dim text-center py-4">
            No recent activity
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  loading,
  color,
  bgColor,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  loading: boolean;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-lg p-4 flex items-center gap-4">
      <div className={cn("p-2.5 rounded-lg", bgColor)}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-xs text-panel-text-dim">{label}</p>
        {loading ? (
          <Loader2 size={16} className="text-panel-text-dim animate-spin mt-1" />
        ) : (
          <p className={cn("text-2xl font-bold", color)}>{value}</p>
        )}
      </div>
    </div>
  );
}
