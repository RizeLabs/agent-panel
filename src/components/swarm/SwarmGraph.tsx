import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Code, Search, BookOpen } from "lucide-react";
import type { Swarm, Task, AgentStatus, Message } from "../../lib/types";
import { useAgents } from "../../hooks/useAgents";
import { getTasks, getMessages, onAgentWaitingInput } from "../../lib/tauri";
import { parseJsonSafe } from "../../lib/utils";

const CANVAS_H = 480;

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  x: number;
  y: number;
  isCoordinator: boolean;
  currentTask?: Task;
}

interface FlowEdge {
  fromId: string;
  toId: string;
  messageType: string;
  id: number;
  timestamp: number;
}

function statusBorderHex(status: AgentStatus): string {
  switch (status) {
    case "running": return "#22c55e";
    case "error":   return "#ef4444";
    case "paused":  return "#eab308";
    case "idle":    return "#4b5563";
    case "stopped": return "#374151";
  }
}

function edgeColor(msgType: string): string {
  const map: Record<string, string> = {
    completion_report: "#22c55e",
    response:          "#22c55e",
    question:          "#eab308",
    task_update:       "#eab308",
    insight:           "#06b6d4",
    finding:           "#06b6d4",
    request:           "#a855f7",
  };
  return map[msgType] ?? "#a855f7";
}

function RoleIcon({ role, size = 18 }: { role: string; size?: number }) {
  switch (role) {
    case "coordinator": return <Bot size={size} />;
    case "coder":       return <Code size={size} />;
    case "researcher":  return <Search size={size} />;
    case "content":     return <BookOpen size={size} />;
    default:            return <Bot size={size} />;
  }
}

export default function SwarmGraph({ swarm }: { swarm: Swarm }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(700);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([]);
  const [waitingAgents, setWaitingAgents] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<AgentNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const prevMsgIdsRef = useRef(new Set<number>());
  const agentIdSetRef = useRef(new Set<string>());

  const agentIds = useMemo(
    () => parseJsonSafe<string[]>(swarm.agent_ids, []),
    [swarm.agent_ids]
  );
  const coordinatorId = swarm.coordinator_id;

  // Keep agentIdSet ref in sync
  useEffect(() => {
    agentIdSetRef.current = new Set(agentIds);
  }, [agentIds]);

  // Responsive canvas width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setCanvasW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { data: agents } = useAgents();

  const { data: allTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => getTasks(),
    refetchInterval: 5000,
  });

  const { data: messages } = useQuery({
    queryKey: ["messages-vis", swarm.id],
    queryFn: () => getMessages({ limit: 30 }),
    refetchInterval: 3000,
  });

  // Track waiting agents via events
  useEffect(() => {
    const unlisten = onAgentWaitingInput((event) => {
      setWaitingAgents((prev) => {
        const next = new Set(prev);
        if (event.waiting) next.add(event.agent_id);
        else next.delete(event.agent_id);
        return next;
      });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Diff messages and add animated flow edges
  useEffect(() => {
    if (!messages) return;
    const newMsgs = messages.filter((m) => !prevMsgIdsRef.current.has(m.id));
    if (newMsgs.length) {
      const now = Date.now();
      setFlowEdges((prev) => [
        ...prev.filter((e) => now - e.timestamp < 8000),
        ...newMsgs
          .filter(
            (m) =>
              m.to_agent !== null &&
              agentIdSetRef.current.has(m.from_agent)
          )
          .map((m) => ({
            fromId: m.from_agent,
            toId: m.to_agent as string,
            messageType: m.message_type as string,
            id: m.id,
            timestamp: now,
          })),
      ]);
      prevMsgIdsRef.current = new Set(messages.map((m) => m.id));
    }
  }, [messages]);

  // Purge stale edges every 2 s
  useEffect(() => {
    const t = setInterval(() => {
      setFlowEdges((prev) =>
        prev.filter((e) => Date.now() - e.timestamp < 8000)
      );
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // Compute node positions
  const nodes = useMemo<AgentNode[]>(() => {
    if (!agents || agentIds.length === 0) return [];
    const cx = canvasW / 2;
    const cy = CANVAS_H / 2;
    const radius = Math.min(canvasW, CANVAS_H) * 0.35;
    const memberIds = agentIds.filter((id) => id !== coordinatorId);
    const result: AgentNode[] = [];

    if (coordinatorId) {
      const agent = agents.find((a) => a.id === coordinatorId);
      if (agent) {
        result.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          x: cx,
          y: cy,
          isCoordinator: true,
          currentTask: allTasks?.find(
            (t) => t.assigned_agent === coordinatorId && t.status === "in_progress"
          ),
        });
      }
    }

    memberIds.forEach((id, i) => {
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;
      const N = memberIds.length || 1;
      const angle = (2 * Math.PI * i) / N - Math.PI / 2;
      result.push({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        isCoordinator: false,
        currentTask: allTasks?.find(
          (t) => t.assigned_agent === id && t.status === "in_progress"
        ),
      });
    });

    return result;
  }, [agents, agentIds, coordinatorId, canvasW, allTasks]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, AgentNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const coordinator = nodes.find((n) => n.isCoordinator);
  const members = nodes.filter((n) => !n.isCoordinator);

  const handleMouseEnter = (node: AgentNode, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    setHoveredNode(node);
  };

  if (agentIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-panel-text-dim text-sm">
        No agents in this swarm
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full bg-panel-bg rounded-lg border border-panel-border"
        style={{ height: CANVAS_H }}
      >
        {/* SVG edge layer */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: "none", overflow: "visible" }}
        >
          {/* Static background edges: coordinator → each member */}
          {coordinator &&
            members.map((m) => (
              <line
                key={`bg-${m.id}`}
                x1={coordinator.x}
                y1={coordinator.y}
                x2={m.x}
                y2={m.y}
                stroke="#2a2a3a"
                strokeWidth={1.5}
              />
            ))}

          {/* Animated flow circles */}
          {flowEdges.map((edge) => {
            const from = nodeMap.get(edge.fromId);
            const to = nodeMap.get(edge.toId);
            if (!from || !to) return null;
            const pathId = `fp-${edge.id}`;
            return (
              <g key={edge.id}>
                <path
                  id={pathId}
                  d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                  fill="none"
                  stroke="none"
                />
                <circle r={5} fill={edgeColor(edge.messageType)}>
                  <animateMotion dur="1.4s" repeatCount="1" fill="remove">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Agent node divs */}
        {nodes.map((node) => (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: node.x - 40,
              top: node.y - 40,
              width: 80,
            }}
            className="flex flex-col items-center cursor-default select-none"
            onMouseEnter={(e) => handleMouseEnter(node, e)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            {/* Circle with status border */}
            <div
              className="relative flex items-center justify-center rounded-full bg-panel-surface text-panel-text-dim"
              style={{
                width: 56,
                height: 56,
                border: `3px solid ${statusBorderHex(node.status)}`,
              }}
            >
              <RoleIcon role={node.isCoordinator ? "coordinator" : node.role} />
              {/* Waiting indicator */}
              {waitingAgents.has(node.id) && (
                <span
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"
                  style={{ border: "2px solid #0d0d14" }}
                />
              )}
            </div>
            {/* Name label */}
            <span className="text-[10px] text-panel-text mt-1 text-center leading-none max-w-full truncate px-1">
              {node.name.length > 10 ? `${node.name.slice(0, 10)}…` : node.name}
            </span>
            {/* Role pill */}
            <span className="text-[9px] text-panel-text-dim uppercase tracking-wide mt-0.5">
              {node.role.slice(0, 8)}
            </span>
          </div>
        ))}

        {/* Hover tooltip */}
        {hoveredNode && (
          <NodeTooltip
            node={hoveredNode}
            pos={tooltipPos}
            canvasW={canvasW}
            messages={messages ?? []}
          />
        )}
      </div>

      {/* Legend strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-panel-text-dim">
        {(
          [
            { color: "#22c55e", label: "Running" },
            { color: "#ef4444", label: "Error" },
            { color: "#eab308", label: "Waiting", pulse: true },
            { color: "#4b5563", label: "Idle" },
          ] as { color: string; label: string; pulse?: boolean }[]
        ).map(({ color, label, pulse }) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className={pulse ? "animate-pulse" : ""}
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: color,
              }}
            />
            {label}
          </div>
        ))}
        <span className="text-panel-border mx-1">|</span>
        {(
          [
            { color: "#22c55e", label: "Completion" },
            { color: "#eab308", label: "Question" },
            { color: "#06b6d4", label: "Insight" },
            { color: "#a855f7", label: "Other" },
          ] as { color: string; label: string }[]
        ).map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 2,
                backgroundColor: color,
                borderRadius: 1,
              }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeTooltip({
  node,
  pos,
  canvasW,
  messages,
}: {
  node: AgentNode;
  pos: { x: number; y: number };
  canvasW: number;
  messages: Message[];
}) {
  const TOOLTIP_W = 210;
  const left = Math.min(pos.x + 14, canvasW - TOOLTIP_W - 8);
  const top = Math.max(8, pos.y - 16);

  const recentCount = messages.filter(
    (m) => m.from_agent === node.id || m.to_agent === node.id
  ).length;

  return (
    <div
      className="absolute z-50 bg-panel-surface border border-panel-border rounded-lg p-3 shadow-xl pointer-events-none text-left"
      style={{ left, top, width: TOOLTIP_W }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <RoleIcon role={node.isCoordinator ? "coordinator" : node.role} size={14} />
        <span className="text-xs font-semibold text-panel-text truncate">
          {node.name}
        </span>
      </div>

      {/* Role + status */}
      <div className="flex items-center gap-2 text-[10px] text-panel-text-dim mb-2">
        <span className="capitalize">{node.role}</span>
        <span
          className="rounded-full px-1.5 py-0.5 font-medium"
          style={{
            color: statusBorderHex(node.status),
            backgroundColor: `${statusBorderHex(node.status)}20`,
          }}
        >
          {node.status}
        </span>
      </div>

      {/* Current task */}
      <div className="border-t border-panel-border pt-2 mb-2">
        {node.currentTask ? (
          <>
            <div className="text-[9px] text-panel-text-dim uppercase tracking-wider mb-1">
              Active Task
            </div>
            <div className="text-[11px] text-panel-text leading-snug line-clamp-2">
              {node.currentTask.title}
            </div>
            <div className="text-[10px] text-blue-400 mt-0.5">in_progress</div>
          </>
        ) : (
          <div className="text-[11px] text-panel-text-dim italic">
            No active task
          </div>
        )}
      </div>

      {/* Recent messages */}
      <div className="border-t border-panel-border pt-2">
        {recentCount > 0 ? (
          <div className="text-[10px] text-panel-text-dim">
            {recentCount} recent message{recentCount !== 1 ? "s" : ""}
          </div>
        ) : (
          <div className="text-[11px] text-panel-text-dim italic">
            No recent messages
          </div>
        )}
      </div>
    </div>
  );
}
