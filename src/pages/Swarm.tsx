import { useState } from "react";
import { MessageSquare, BookOpen, Network, Timer } from "lucide-react";
import { cn } from "../lib/utils";
import type { Swarm } from "../lib/types";
import SwarmView from "../components/swarm/SwarmView";
import MessageFeed from "../components/swarm/MessageFeed";
import KnowledgeBase from "../components/swarm/KnowledgeBase";
import SwarmGraph from "../components/swarm/SwarmGraph";
import CronJobs from "../components/swarm/CronJobs";

type BottomTab = "messages" | "knowledge" | "graph" | "cron";

export default function Swarm() {
  const [activeTab, setActiveTab] = useState<BottomTab>("messages");
  const [currentSwarm, setCurrentSwarm] = useState<Swarm | undefined>(undefined);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Top: Swarm View */}
      <div className="shrink-0">
        <SwarmView onSwarmChange={setCurrentSwarm} />
      </div>

      {/* Bottom: Tabbed section */}
      <div className="flex-1 flex flex-col bg-panel-surface border border-panel-border rounded-lg overflow-hidden min-h-0">
        {/* Tab Bar */}
        <div className="flex items-center border-b border-panel-border shrink-0">
          <TabButton
            active={activeTab === "messages"}
            onClick={() => setActiveTab("messages")}
            icon={MessageSquare}
            label="Message Feed"
          />
          <TabButton
            active={activeTab === "knowledge"}
            onClick={() => setActiveTab("knowledge")}
            icon={BookOpen}
            label="Knowledge Base"
          />
          <TabButton
            active={activeTab === "graph"}
            onClick={() => setActiveTab("graph")}
            icon={Network}
            label="Graph"
          />
          <TabButton
            active={activeTab === "cron"}
            onClick={() => setActiveTab("cron")}
            icon={Timer}
            label="Cron"
          />
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === "messages" && <MessageFeed />}
          {activeTab === "knowledge" && <KnowledgeBase />}
          {activeTab === "graph" && currentSwarm && (
            <SwarmGraph swarm={currentSwarm} />
          )}
          {activeTab === "graph" && !currentSwarm && (
            <div className="flex items-center justify-center h-48 text-panel-text-dim text-sm">
              Create and select a swarm to view the graph
            </div>
          )}
          {activeTab === "cron" && <CronJobs />}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
        active
          ? "text-panel-accent border-panel-accent"
          : "text-panel-text-dim border-transparent hover:text-panel-text hover:border-panel-border"
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
