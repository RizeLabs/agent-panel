import type { AgentStatus, TaskPriority, TaskStatus } from "./types";

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function statusColor(status: AgentStatus): string {
  const colors: Record<AgentStatus, string> = {
    idle: "text-panel-text-dim",
    running: "text-panel-success",
    paused: "text-panel-warning",
    error: "text-panel-error",
    stopped: "text-gray-600",
  };
  return colors[status] || "text-panel-text-dim";
}

export function statusDotColor(status: AgentStatus): string {
  const colors: Record<AgentStatus, string> = {
    idle: "bg-panel-text-dim",
    running: "bg-panel-success",
    paused: "bg-panel-warning",
    error: "bg-panel-error",
    stopped: "bg-gray-600",
  };
  return colors[status] || "bg-panel-text-dim";
}

export function priorityColor(priority: TaskPriority): string {
  const colors: Record<TaskPriority, string> = {
    low: "text-panel-text-dim",
    medium: "text-blue-400",
    high: "text-panel-warning",
    urgent: "text-panel-error",
  };
  return colors[priority] || "text-panel-text-dim";
}

export function taskStatusColor(status: TaskStatus): string {
  const colors: Record<TaskStatus, string> = {
    todo: "bg-panel-text-dim",
    in_progress: "bg-blue-500",
    done: "bg-panel-success",
    blocked: "bg-panel-error",
  };
  return colors[status] || "bg-panel-text-dim";
}

export function roleIcon(role: string): string {
  const icons: Record<string, string> = {
    coder: "Code",
    researcher: "Search",
    content: "FileText",
    coordinator: "GitBranch",
  };
  return icons[role] || "Bot";
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function parseJsonSafe<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
