import { Loader2 } from "lucide-react";
import { useAgents } from "../../hooks/useAgents";
import AgentCard from "./AgentCard";

interface AgentListProps {
  onSelectAgent: (id: string) => void;
}

export default function AgentList({ onSelectAgent }: AgentListProps) {
  const { data: agents, isLoading, isError, error } = useAgents();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-panel-accent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-20 text-panel-error text-sm">
        Failed to load agents{error instanceof Error ? `: ${error.message}` : ""}
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-panel-text-dim text-sm gap-2">
        <span>No agents configured. Create one to get started.</span>
      </div>
    );
  }

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      }}
    >
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} onSelect={onSelectAgent} />
      ))}
    </div>
  );
}
