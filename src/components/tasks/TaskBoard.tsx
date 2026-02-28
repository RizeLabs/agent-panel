import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Layout, X, Save } from "lucide-react";
import type { Agent, Swarm, Task, TaskPriority, TaskStatus } from "../../lib/types";
import { cn } from "../../lib/utils";
import { getTasks, createTask, deleteTask, updateTask, getAgents, getSwarms } from "../../lib/tauri";
import { toast } from "sonner";
import TaskCard from "./TaskCard";

const columns: { status: TaskStatus; label: string; color: string }[] = [
  { status: "todo", label: "Todo", color: "border-t-panel-text-dim" },
  { status: "in_progress", label: "In Progress", color: "border-t-blue-500" },
  { status: "done", label: "Done", color: "border-t-panel-success" },
  { status: "blocked", label: "Blocked", color: "border-t-panel-error" },
];

const priorities: TaskPriority[] = ["low", "medium", "high", "urgent"];

interface TaskBoardProps {
  onSyncStatusChange?: (syncing: boolean) => void;
}

export default function TaskBoard({ onSyncStatusChange: _ }: TaskBoardProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Refs so global mouse handlers never go stale
  const pendingDragRef = useRef<{ taskId: string; startX: number; startY: number } | null>(null);
  const draggingTaskIdRef = useRef<string | null>(null);
  const dragOverStatusRef = useRef<TaskStatus | null>(null);
  const tasksRef = useRef<Task[]>([]);
  const columnRefs = useRef<Partial<Record<TaskStatus, HTMLDivElement>>>({});
  const updateMutateFnRef = useRef<((task: Task) => void) | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => getTasks(),
    refetchInterval: 10000,
  });

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
  });

  const { data: swarms } = useQuery({
    queryKey: ["swarms"],
    queryFn: getSwarms,
  });

  // Keep tasksRef in sync with latest query data
  useEffect(() => { tasksRef.current = tasks ?? []; }, [tasks]);

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowCreate(false);
      toast.success("Task created");
    },
    onError: (e) => toast.error(`Failed to create task: ${(e as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task deleted");
    },
    onError: (e) => toast.error(`Failed to delete task: ${(e as Error).message}`),
  });

  const updateMutation = useMutation({
    mutationFn: updateTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(`Failed to update task: ${(e as Error).message}`),
  });

  // Keep mutate fn ref in sync
  updateMutateFnRef.current = updateMutation.mutate;

  const moveTask = (task: Task, newStatus: TaskStatus) => {
    if (task.status === newStatus) return;
    updateMutation.mutate({ ...task, status: newStatus });
  };

  // Global mouse handlers for drag-and-drop (avoids HTML5 DnD issues in Tauri webview)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const pending = pendingDragRef.current;
      if (!pending) return;

      // Activate drag only after moving 5px (prevents accidental drags on clicks)
      if (!draggingTaskIdRef.current) {
        const dx = Math.abs(e.clientX - pending.startX);
        const dy = Math.abs(e.clientY - pending.startY);
        if (dx > 5 || dy > 5) {
          draggingTaskIdRef.current = pending.taskId;
          setIsDragging(true);
          document.body.style.cursor = "grabbing";
          document.body.style.userSelect = "none";
        }
      }

      if (!draggingTaskIdRef.current) return;

      // Find which column the mouse is over using bounding rects
      let found: TaskStatus | null = null;
      for (const { status } of columns) {
        const el = columnRefs.current[status];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        ) {
          found = status;
          break;
        }
      }

      if (found !== dragOverStatusRef.current) {
        dragOverStatusRef.current = found;
        setDragOverStatus(found);
      }
    };

    const handleMouseUp = () => {
      const taskId = draggingTaskIdRef.current;
      const targetStatus = dragOverStatusRef.current;

      if (taskId && targetStatus) {
        const task = tasksRef.current.find((t) => t.id === taskId);
        if (task && task.status !== targetStatus) {
          updateMutateFnRef.current?.({ ...task, status: targetStatus });
        }
      }

      // Reset all drag state
      pendingDragRef.current = null;
      draggingTaskIdRef.current = null;
      dragOverStatusRef.current = null;
      setDragOverStatus(null);
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []); // empty deps — all state accessed via refs

  const getTasksByStatus = (status: TaskStatus): Task[] => {
    if (!tasks) return [];
    return tasks.filter((t: Task) => t.status === status);
  };

  const swarmMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of swarms ?? []) m[s.id] = s.name;
    return m;
  }, [swarms]);

  const agentMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of agents ?? []) m[a.id] = a.name;
    return m;
  }, [agents]);

  return (
    <div className={cn("flex flex-col gap-4 h-full", isDragging && "cursor-grabbing")}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Layout size={20} className="text-panel-accent" />
          <h2 className="text-lg font-semibold text-panel-text">Task Board</h2>
          {tasks && (
            <span className="text-xs text-panel-text-dim">{tasks.length} tasks</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25 transition-colors"
        >
          <Plus size={14} />
          New Task
        </button>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-panel-text-dim animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
          {columns.map(({ status, label, color }) => {
            const columnTasks = getTasksByStatus(status);
            const isDropTarget = dragOverStatus === status;
            return (
              <div
                key={status}
                ref={(el) => { if (el) columnRefs.current[status] = el; }}
                className={cn(
                  "flex flex-col bg-panel-surface/50 border border-panel-border rounded-lg overflow-hidden border-t-2 transition-colors duration-100",
                  color,
                  isDropTarget && "bg-panel-accent/5 border-panel-accent/40"
                )}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border shrink-0">
                  <span className="text-xs font-medium text-panel-text">{label}</span>
                  <span className="text-[10px] text-panel-text-dim bg-panel-border/50 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className={cn(
                  "flex-1 overflow-y-auto p-2 space-y-2",
                  isDropTarget && "ring-1 ring-inset ring-panel-accent/30 rounded-b-lg"
                )}>
                  {columnTasks.length > 0 ? (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        swarmName={task.swarm_id ? swarmMap[task.swarm_id] : undefined}
                        agentName={task.assigned_agent ? agentMap[task.assigned_agent] : undefined}
                        onDelete={() => deleteMutation.mutate(task.id)}
                        onPickUp={(e) => {
                          pendingDragRef.current = {
                            taskId: task.id,
                            startX: e.clientX,
                            startY: e.clientY,
                          };
                        }}
                        onStatusChange={(newStatus) => moveTask(task, newStatus)}
                      />
                    ))
                  ) : (
                    <p className={cn(
                      "text-[10px] text-panel-text-dim text-center py-4 italic",
                      isDropTarget && "text-panel-accent/60"
                    )}>
                      {isDropTarget ? "Drop here" : "No tasks"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Task Modal */}
      {showCreate && (
        <CreateTaskModal
          agents={agents ?? []}
          swarms={swarms ?? []}
          onClose={() => setShowCreate(false)}
          onSubmit={(req) => createMutation.mutate(req)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateTaskModal({
  agents,
  swarms,
  onClose,
  onSubmit,
  isPending,
}: {
  agents: Agent[];
  swarms: Swarm[];
  onClose: () => void;
  onSubmit: (req: {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    assigned_agent?: string;
    swarm_id?: string;
  }) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedSwarmId, setSelectedSwarmId] = useState<string>("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  const availableAgents = useMemo(() => {
    if (!selectedSwarmId) return agents;
    const swarm = swarms.find((s) => s.id === selectedSwarmId);
    if (!swarm) return agents;
    let ids: string[] = [];
    try { ids = JSON.parse(swarm.agent_ids); } catch { /* ignore */ }
    return agents.filter((a) => ids.includes(a.id));
  }, [selectedSwarmId, agents, swarms]);

  const handleSwarmChange = (swarmId: string) => {
    setSelectedSwarmId(swarmId);
    if (swarmId) {
      const swarm = swarms.find((s) => s.id === swarmId);
      let ids: string[] = [];
      try { ids = JSON.parse(swarm?.agent_ids ?? "[]"); } catch { /* ignore */ }
      if (!ids.includes(selectedAgentId)) setSelectedAgentId("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      swarm_id: selectedSwarmId || undefined,
      assigned_agent: selectedAgentId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-panel-surface border border-panel-border rounded-lg w-full max-w-md p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-panel-text">New Task</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-panel-text-dim hover:text-panel-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block text-xs text-panel-text-dim mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title..."
          autoFocus
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3"
        />

        <label className="block text-xs text-panel-text-dim mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          rows={3}
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3 resize-none"
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-panel-text-dim mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            >
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-panel-text-dim mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            >
              {priorities.map((p) => (
                <option key={p} value={p} className="capitalize">{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-panel-text-dim mb-1">Swarm</label>
            <select
              value={selectedSwarmId}
              onChange={(e) => handleSwarmChange(e.target.value)}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            >
              <option value="">None</option>
              {swarms.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-panel-text-dim mb-1">
              Agent
              {selectedSwarmId && (
                <span className="text-panel-text-dim/60 ml-1">(swarm members)</span>
              )}
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            >
              <option value="">Unassigned</option>
              {availableAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

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
            disabled={!title.trim() || isPending}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isPending ? "Creating..." : "Create Task"}
          </button>
        </div>
      </form>
    </div>
  );
}
