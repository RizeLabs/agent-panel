import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";
import TaskBoard from "../components/tasks/TaskBoard";

export default function Tasks() {
  const [syncing, setSyncing] = useState(false);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Notion sync status indicator */}
      {syncing && (
        <div className="flex items-center gap-2 bg-panel-accent/10 border border-panel-accent/30 rounded-md px-3 py-2 shrink-0">
          <RefreshCw size={13} className="text-panel-accent animate-spin" />
          <span className="text-xs text-panel-accent">
            Syncing with Notion...
          </span>
        </div>
      )}

      {/* Task Board */}
      <div className="flex-1 min-h-0">
        <TaskBoard onSyncStatusChange={setSyncing} />
      </div>
    </div>
  );
}
