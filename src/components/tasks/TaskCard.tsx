import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Bot,
  Trash2,
} from "lucide-react";
import type { Task, TaskPriority } from "../../lib/types";
import { cn, priorityColor, timeAgo } from "../../lib/utils";

interface TaskCardProps {
  task: Task;
  onDelete?: () => void;
}

const priorityIcons: Record<TaskPriority, React.ElementType> = {
  urgent: AlertTriangle,
  high: ArrowUp,
  medium: Minus,
  low: ArrowDown,
};

const priorityBadgeColors: Record<TaskPriority, string> = {
  urgent: "bg-red-500/15 text-red-400",
  high: "bg-panel-warning/15 text-panel-warning",
  medium: "bg-blue-500/15 text-blue-400",
  low: "bg-panel-text-dim/15 text-panel-text-dim",
};

export default function TaskCard({ task, onDelete }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const PriorityIcon = priorityIcons[task.priority] ?? Minus;
  const badgeColor =
    priorityBadgeColors[task.priority] ?? "bg-panel-text-dim/15 text-panel-text-dim";

  const truncatedDescription =
    task.description && task.description.length > 80
      ? task.description.slice(0, 80) + "..."
      : task.description;

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className={cn(
        "w-full text-left bg-panel-bg border border-panel-border rounded-md p-3",
        "hover:border-panel-accent/50 transition-colors duration-150 cursor-pointer",
        "focus:outline-none focus:ring-1 focus:ring-panel-accent"
      )}
    >
      {/* Title row */}
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-xs font-medium text-panel-text flex-1 leading-tight">
          {task.title}
        </span>
        {expanded ? (
          <ChevronUp size={12} className="text-panel-text-dim shrink-0 mt-0.5" />
        ) : (
          <ChevronDown size={12} className="text-panel-text-dim shrink-0 mt-0.5" />
        )}
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-[11px] text-panel-text-dim leading-relaxed mb-2">
          {expanded ? task.description : truncatedDescription}
        </p>
      )}

      {/* Priority Badge */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
            badgeColor
          )}
        >
          <PriorityIcon size={10} />
          {task.priority}
        </span>
      </div>

      {/* Footer: assigned agent + timestamp */}
      <div className="flex items-center gap-2 text-[10px] text-panel-text-dim">
        {task.assigned_agent && (
          <span className="flex items-center gap-1">
            <Bot size={10} />
            <span className="text-panel-text">{task.assigned_agent}</span>
          </span>
        )}
        <span className="ml-auto">{timeAgo(task.updated_at)}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-panel-border space-y-1.5">
          <div className="text-[10px] text-panel-text-dim">
            <span className="text-panel-text-dim/70">ID:</span>{" "}
            <span className="font-mono text-panel-text">{task.id}</span>
          </div>
          {task.blocked_by && (
            <div className="text-[10px] text-panel-text-dim">
              <span className="text-panel-text-dim/70">Blocked by:</span>{" "}
              <span className="font-mono text-panel-error">{task.blocked_by}</span>
            </div>
          )}
          <div className="text-[10px] text-panel-text-dim">
            <span className="text-panel-text-dim/70">Status:</span>{" "}
            <span className={cn("capitalize", priorityColor(task.priority))}>
              {task.status.replace("_", " ")}
            </span>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex items-center gap-1 text-[10px] text-panel-error/70 hover:text-panel-error transition-colors mt-1"
            >
              <Trash2 size={10} />
              Delete task
            </button>
          )}
        </div>
      )}
    </button>
  );
}
