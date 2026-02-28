import { useEffect, useRef, useState } from "react";
import { useAgentLogs } from "../../hooks/useAgents";
import { onAgentLog } from "../../lib/tauri";
import { formatDate, cn } from "../../lib/utils";
import type { AgentLog as AgentLogEntry, LogType } from "../../lib/types";
import { ChevronRight, ChevronDown, CheckCircle2, AlertCircle, Lightbulb, Play } from "lucide-react";

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
    system: "text-blue-400",
    assistant: "text-panel-text",
    result: "text-cyan-400",
    user_input: "text-green-400",
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
    system: "SYS",
    assistant: "ASST",
    result: "RESULT",
    user_input: "INPUT",
  };
  return map[logType] ?? logType.toUpperCase();
}

function ToolUseEntry({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  // Format: [toolName] {...json...}
  const m = content.match(/^\[([^\]]+)\] (.*)/s);
  const name = m?.[1] ?? "tool";
  const input = m?.[2] ?? content;

  let pretty = input;
  try {
    pretty = JSON.stringify(JSON.parse(input), null, 2);
  } catch {}

  return (
    <div className="leading-5 w-full">
      <button
        className="flex items-center gap-1.5 text-purple-300 hover:text-purple-200 w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown size={9} className="shrink-0" />
        ) : (
          <ChevronRight size={9} className="shrink-0" />
        )}
        <span className="font-semibold text-purple-400">[{name}]</span>
        {!open && (
          <span className="text-panel-text-dim truncate">
            {input.slice(0, 100)}{input.length > 100 ? "…" : ""}
          </span>
        )}
      </button>
      {open && (
        <pre className="mt-0.5 pl-4 text-[9px] text-panel-text-dim overflow-x-auto leading-relaxed">
          {pretty}
        </pre>
      )}
    </div>
  );
}

// ─── Coordinator JSON Output ──────────────────────────────────

interface CoordinatorOutput {
  insights?: string[];
  task_assignments?: Array<{ task_id: string; agent_id: string; instructions: string }>;
  task_completions?: string[];
  task_rejections?: Array<{ task_id: string; agent_id: string; feedback: string }>;
  human_queries?: string[];
  new_tasks?: Array<{ title: string; description?: string; priority?: string }>;
}

function CoordinatorOutputEntry({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  let output: CoordinatorOutput = {};
  try {
    output = JSON.parse(content);
  } catch {
    return <span className="text-panel-text/90 whitespace-pre-wrap">{content}</span>;
  }

  const hasInsights = output.insights?.length ?? 0 > 0;
  const hasAssignments = output.task_assignments?.length ?? 0 > 0;
  const hasCompletions = output.task_completions?.length ?? 0 > 0;
  const hasRejections = output.task_rejections?.length ?? 0 > 0;
  const hasQueries = output.human_queries?.length ?? 0 > 0;
  const hasNewTasks = output.new_tasks?.length ?? 0 > 0;

  return (
    <div className="space-y-1.5 w-full">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-cyan-300 hover:text-cyan-200"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Coordinator Decision
        {!expanded && (
          <span className="text-[10px] text-panel-text-dim ml-1">
            {[
              hasCompletions && `${output.task_completions?.length} completed`,
              hasRejections && `${output.task_rejections?.length} rejected`,
              hasAssignments && `${output.task_assignments?.length} assigned`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pl-3 border-l border-cyan-400/30 space-y-1.5">
          {hasInsights && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300">
                <Lightbulb size={9} />
                Insights
              </div>
              {output.insights?.map((insight, i) => (
                <p key={i} className="text-[10px] text-panel-text/80 leading-relaxed pl-4">
                  • {insight}
                </p>
              ))}
            </div>
          )}

          {hasCompletions && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-green-400">
                <CheckCircle2 size={9} />
                Task Completions
              </div>
              <div className="pl-4 space-y-0.5">
                {output.task_completions?.map((id, i) => (
                  <code key={i} className="text-[9px] text-green-300">
                    ✓ {id.slice(0, 8)}…
                  </code>
                ))}
              </div>
            </div>
          )}

          {hasRejections && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400">
                <AlertCircle size={9} />
                Task Rejections
              </div>
              {output.task_rejections?.map((rej, i) => (
                <div key={i} className="pl-4 border-l border-amber-400/30 space-y-0.5">
                  <code className="text-[9px] text-amber-300">Task {rej.task_id.slice(0, 8)}…</code>
                  <p className="text-[9px] text-panel-text/70 leading-relaxed">{rej.feedback}</p>
                </div>
              ))}
            </div>
          )}

          {hasAssignments && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-300">
                <Play size={9} />
                Task Assignments
              </div>
              {output.task_assignments?.map((assign, i) => (
                <div key={i} className="pl-4 space-y-0.5">
                  <code className="text-[9px] text-blue-300">→ {assign.task_id.slice(0, 8)}…</code>
                  <p className="text-[9px] text-panel-text/70 leading-relaxed">{assign.instructions}</p>
                </div>
              ))}
            </div>
          )}

          {hasQueries && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-orange-300">❓ Human Queries</div>
              {output.human_queries?.map((query, i) => (
                <p key={i} className="text-[10px] text-panel-text/80 leading-relaxed pl-4">
                  → {query}
                </p>
              ))}
            </div>
          )}

          {hasNewTasks && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-purple-300">🆕 New Tasks</div>
              {output.new_tasks?.map((task, i) => (
                <div key={i} className="pl-4 space-y-0.5">
                  <p className="text-[10px] text-purple-300 font-medium">{task.title}</p>
                  {task.description && (
                    <p className="text-[9px] text-panel-text-dim">{task.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Result Entry ────────────────────────────────────────────

function ResultEntry({ content }: { content: string }) {
  const m = content.match(/cost=\$([0-9.]+), session=([^,]+), duration=(\d+)ms/);
  const cost = m?.[1] ?? "0.0000";
  const session = m?.[2] ?? "none";
  const duration = m?.[3] ?? "0";

  const durationSec = Math.round(parseInt(duration) / 1000);

  return (
    <div className="flex items-center gap-3 text-[10px]">
      <div className="px-2 py-1 bg-emerald-400/15 text-emerald-300 rounded font-mono">
        ${cost}
      </div>
      <div className="px-2 py-1 bg-cyan-400/15 text-cyan-300 rounded font-mono">
        {durationSec}s
      </div>
      <div className="px-2 py-1 bg-panel-border/50 text-panel-text-dim rounded font-mono truncate max-w-[150px]">
        {session.slice(0, 12)}…
      </div>
    </div>
  );
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
              {log.log_type === "tool_use" ? (
                <ToolUseEntry content={log.content} />
              ) : log.log_type === "assistant" && log.content.trim().startsWith("{") ? (
                <CoordinatorOutputEntry content={log.content} />
              ) : log.log_type === "result" ? (
                <ResultEntry content={log.content} />
              ) : (
                <span
                  className={cn(
                    "whitespace-pre-wrap break-all leading-5",
                    log.log_type === "stderr" || log.log_type === "error"
                      ? "text-panel-error/90"
                      : "text-panel-text/90"
                  )}
                >
                  {log.content}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
