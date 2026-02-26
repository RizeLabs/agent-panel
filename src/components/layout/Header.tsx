import { Activity } from "lucide-react";

export default function Header() {
  return (
    <header className="flex items-center justify-between h-12 px-4 bg-panel-surface border-b border-panel-border shrink-0">
      {/* Left: App title */}
      <h1 className="text-sm font-semibold text-panel-text tracking-wide">
        Agent Panel
      </h1>

      {/* Center: Swarm status */}
      <div className="flex items-center gap-2 text-xs text-panel-text-dim">
        <span className="inline-block w-2 h-2 rounded-full bg-panel-text-dim" />
        <span>No active swarm</span>
      </div>

      {/* Right: Activity indicator */}
      <div className="flex items-center gap-1.5 text-xs text-panel-text-dim">
        <Activity size={14} />
        <span>Activity</span>
      </div>
    </header>
  );
}
