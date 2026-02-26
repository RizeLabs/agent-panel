import { Play, Square, Pause, Bot, Code, Search, FileText, GitBranch } from "lucide-react";
import type { Agent } from "../../lib/types";
import { statusDotColor, cn, roleIcon } from "../../lib/utils";
import { useStartAgent, useStopAgent, usePauseAgent, useResumeAgent } from "../../hooks/useAgents";

interface AgentCardProps {
  agent: Agent;
  onSelect: (id: string) => void;
}

const iconMap: Record<string, React.ElementType> = {
  Code,
  Search,
  FileText,
  GitBranch,
  Bot,
};

export default function AgentCard({ agent, onSelect }: AgentCardProps) {
  const startAgent = useStartAgent();
  const stopAgent = useStopAgent();
  const pauseAgent = usePauseAgent();
  const resumeAgent = useResumeAgent();

  const RoleIcon = iconMap[roleIcon(agent.role)] ?? Bot;

  const truncatedDir =
    agent.working_directory && agent.working_directory.length > 28
      ? "..." + agent.working_directory.slice(-25)
      : agent.working_directory;

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  const canStart = agent.status === "idle" || agent.status === "stopped" || agent.status === "error";
  const canStop = agent.status === "running" || agent.status === "paused";
  const canPause = agent.status === "running";
  const canResume = agent.status === "paused";

  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      className={cn(
        "w-full text-left bg-panel-surface border border-panel-border rounded-lg p-4",
        "hover:border-panel-accent transition-colors duration-150 cursor-pointer",
        "focus:outline-none focus:ring-1 focus:ring-panel-accent"
      )}
    >
      {/* Header: status dot + name + role badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "inline-block w-2 h-2 rounded-full shrink-0",
            statusDotColor(agent.status)
          )}
        />
        <span className="text-panel-text text-sm font-medium truncate flex-1">
          {agent.name}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-panel-text-dim bg-panel-border/60 rounded px-1.5 py-0.5">
          <RoleIcon size={12} />
          {agent.role}
        </span>
      </div>

      {/* Model */}
      <div className="text-xs text-panel-text-dim mb-1">
        <span className="text-panel-text-dim/70">Model:</span>{" "}
        <span className="text-panel-text">{agent.model}</span>
      </div>

      {/* Working directory */}
      {agent.working_directory && (
        <div className="text-xs text-panel-text-dim mb-3 truncate" title={agent.working_directory}>
          <span className="text-panel-text-dim/70">Dir:</span>{" "}
          <span className="font-mono text-panel-text-dim">{truncatedDir}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 mt-auto pt-2 border-t border-panel-border">
        {canStart && (
          <ActionButton
            title="Start"
            onClick={(e) => handleAction(e, () => startAgent.mutate(agent.id))}
            className="text-panel-success hover:bg-panel-success/10"
          >
            <Play size={14} />
          </ActionButton>
        )}
        {canResume && (
          <ActionButton
            title="Resume"
            onClick={(e) =>
              handleAction(e, () =>
                resumeAgent.mutate({ agentId: agent.id })
              )
            }
            className="text-panel-success hover:bg-panel-success/10"
          >
            <Play size={14} />
          </ActionButton>
        )}
        {canPause && (
          <ActionButton
            title="Pause"
            onClick={(e) => handleAction(e, () => pauseAgent.mutate(agent.id))}
            className="text-panel-warning hover:bg-panel-warning/10"
          >
            <Pause size={14} />
          </ActionButton>
        )}
        {canStop && (
          <ActionButton
            title="Stop"
            onClick={(e) => handleAction(e, () => stopAgent.mutate(agent.id))}
            className="text-panel-error hover:bg-panel-error/10"
          >
            <Square size={14} />
          </ActionButton>
        )}
        <span
          className={cn(
            "ml-auto text-[11px] capitalize",
            agent.status === "running" && "text-panel-success",
            agent.status === "paused" && "text-panel-warning",
            agent.status === "error" && "text-panel-error",
            (agent.status === "idle" || agent.status === "stopped") && "text-panel-text-dim"
          )}
        >
          {agent.status}
        </span>
      </div>
    </button>
  );
}

function ActionButton({
  children,
  title,
  onClick,
  className,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded transition-colors duration-100",
        className
      )}
    >
      {children}
    </button>
  );
}
