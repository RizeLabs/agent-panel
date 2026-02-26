import { useEffect, useRef, useState } from "react";
import { useAgentLogs } from "../../hooks/useAgents";
import { onAgentLog } from "../../lib/tauri";
import { formatDate, cn } from "../../lib/utils";
import type { AgentLog as AgentLogEntry, LogType } from "../../lib/types";

interface AgentLogProps {
  agentId: string;
}

function logTypeColor(logType: LogType): string {
  const map: Record<LogType, string> = {
    stdout: "text-panel-text",
    stderr: "text-panel-error",
    tool_use: "text-purple-400",
    status_change: "text-panel-warning",
    error: "text-panel-error",
  };
  return map[logType] ?? "text-panel-text-dim";
}

function logTypeBadge(logType: LogType): string {
  const map: Record<LogType, string> = {
    stdout: "OUT",
    stderr: "ERR",
    tool_use: "TOOL",
    status_change: "STATUS",
    error: "ERROR",
  };
  return map[logType] ?? logType.toUpperCase();
}

export default function AgentLog({ agentId }: AgentLogProps) {
  const { data: initialLogs } = useAgentLogs(agentId);
  const [realtimeLogs, setRealtimeLogs] = useState<AgentLogEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Track real-time logs via Tauri event listener
  useEffect(() => {
    setRealtimeLogs([]);

    const unlisten = onAgentLog((event) => {
      if (event.agent_id !== agentId) return;

      const entry: AgentLogEntry = {
        id: Date.now(),
        agent_id: event.agent_id,
        log_type: event.log_type,
        content: event.content,
        created_at: new Date().toISOString(),
      };

      setRealtimeLogs((prev) => [...prev, entry]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [agentId]);

  // Merge initial (from query) + realtime logs, deduplicate by id
  const allLogs = (() => {
    const base = initialLogs ?? [];
    const seen = new Set(base.map((l) => l.id));
    const merged = [...base];
    for (const log of realtimeLogs) {
      if (!seen.has(log.id)) {
        merged.push(log);
        seen.add(log.id);
      }
    }
    return merged;
  })();

  // Handle auto-scroll: only scroll if user is already at bottom
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    shouldAutoScroll.current = atBottom;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el && shouldAutoScroll.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [allLogs.length]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="bg-panel-bg rounded-lg border border-panel-border max-h-[480px] overflow-y-auto font-mono text-xs"
    >
      {allLogs.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-panel-text-dim text-xs">
          No log entries yet.
        </div>
      ) : (
        <div className="divide-y divide-panel-border/40">
          {allLogs.map((log) => (
            <div key={log.id} className="flex gap-3 px-3 py-1.5 hover:bg-panel-surface/40">
              {/* Timestamp */}
              <span className="shrink-0 text-[10px] text-panel-text-dim/60 leading-5 min-w-[110px]">
                {formatDate(log.created_at)}
              </span>

              {/* Log type badge */}
              <span
                className={cn(
                  "shrink-0 text-[10px] font-semibold leading-5 min-w-[48px] uppercase",
                  logTypeColor(log.log_type)
                )}
              >
                {logTypeBadge(log.log_type)}
              </span>

              {/* Content */}
              <span
                className={cn(
                  "whitespace-pre-wrap break-all leading-5",
                  log.log_type === "stderr" || log.log_type === "error"
                    ? "text-panel-error/90"
                    : log.log_type === "tool_use"
                      ? "text-purple-300"
                      : "text-panel-text/90"
                )}
              >
                {log.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
