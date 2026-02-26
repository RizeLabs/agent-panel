import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, Layout } from "lucide-react";
import type { Task, TaskStatus } from "../../lib/types";
import { cn } from "../../lib/utils";
import { getTasks, syncNotion } from "../../lib/tauri";
import TaskCard from "./TaskCard";

const columns: { status: TaskStatus; label: string; color: string }[] = [
  { status: "todo", label: "Todo", color: "border-t-panel-text-dim" },
  { status: "in_progress", label: "In Progress", color: "border-t-blue-500" },
  { status: "done", label: "Done", color: "border-t-panel-success" },
  { status: "blocked", label: "Blocked", color: "border-t-panel-error" },
];

interface TaskBoardProps {
  onSyncStatusChange?: (syncing: boolean) => void;
}

export default function TaskBoard({ onSyncStatusChange }: TaskBoardProps) {
  const queryClient = useQueryClient();

  const {
    data: tasks,
    isLoading,
  } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => getTasks(),
    refetchInterval: 10000,
  });

  const syncMutation = useMutation({
    mutationFn: syncNotion,
    onMutate: () => onSyncStatusChange?.(true),
    onSettled: () => onSyncStatusChange?.(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
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
          <h2 className="text-lg font-semibold text-panel-text">
            Task Board
          </h2>
          {tasks && (
            <span className="text-xs text-panel-text-dim">
              {tasks.length} tasks
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25 transition-colors disabled:opacity-40"
        >
          <RefreshCw
            size={14}
            className={syncMutation.isPending ? "animate-spin" : ""}
          />
          Sync Notion
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
                  <span className="text-xs font-medium text-panel-text">
                    {label}
                  </span>
                  <span className="text-[10px] text-panel-text-dim bg-panel-border/50 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {columnTasks.length > 0 ? (
                    columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} />
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
    </div>
  );
}
