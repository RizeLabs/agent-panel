import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Layout, X, Save } from "lucide-react";
import type { Task, TaskStatus, TaskPriority } from "../../lib/types";
import { cn } from "../../lib/utils";
import { getTasks, createTask, deleteTask } from "../../lib/tauri";
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

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => getTasks(),
    refetchInterval: 10000,
  });

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

  const getTasksByStatus = (status: TaskStatus): Task[] => {
    if (!tasks) return [];
    return tasks.filter((t: Task) => t.status === status);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
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
            return (
              <div
                key={status}
                className={cn(
                  "flex flex-col bg-panel-surface/50 border border-panel-border rounded-lg overflow-hidden border-t-2",
                  color
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
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {columnTasks.length > 0 ? (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onDelete={() => deleteMutation.mutate(task.id)}
                      />
                    ))
                  ) : (
                    <p className="text-[10px] text-panel-text-dim text-center py-4 italic">
                      No tasks
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
          onClose={() => setShowCreate(false)}
          onSubmit={(req) => createMutation.mutate(req)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateTaskModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (req: { title: string; description?: string; status?: string; priority?: string }) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
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

        <div className="grid grid-cols-2 gap-3 mb-4">
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
