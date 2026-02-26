import { useState } from "react";
import { X } from "lucide-react";
import type { Agent, CreateAgentRequest, UpdateAgentRequest, AgentRole, ModelType } from "../../lib/types";
import { useCreateAgent, useUpdateAgent } from "../../hooks/useAgents";
import { cn } from "../../lib/utils";

interface AgentConfigProps {
  agent?: Agent;
  onClose: () => void;
}

const ROLES: { value: AgentRole; label: string }[] = [
  { value: "coder", label: "Coder" },
  { value: "researcher", label: "Researcher" },
  { value: "content", label: "Content" },
  { value: "coordinator", label: "Coordinator" },
  { value: "custom", label: "Custom" },
];

const MODELS: { value: ModelType; label: string }[] = [
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
];

export default function AgentConfig({ agent, onClose }: AgentConfigProps) {
  const isEdit = !!agent;

  const [name, setName] = useState(agent?.name ?? "");
  const [role, setRole] = useState<string>(agent?.role ?? "coder");
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt ?? "");
  const [workingDirectory, setWorkingDirectory] = useState(agent?.working_directory ?? "");
  const [model, setModel] = useState<ModelType>(agent?.model ?? "sonnet");
  const [maxTurns, setMaxTurns] = useState(agent?.max_turns ?? 10);

  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

  const isPending = createAgent.isPending || updateAgent.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isEdit && agent) {
      const request: UpdateAgentRequest = {
        id: agent.id,
        name: name.trim(),
        role,
        system_prompt: systemPrompt.trim() || undefined,
        working_directory: workingDirectory.trim() || undefined,
        model,
        max_turns: maxTurns,
      };
      updateAgent.mutate(request, { onSuccess: onClose });
    } else {
      const request: CreateAgentRequest = {
        name: name.trim(),
        role,
        system_prompt: systemPrompt.trim() || undefined,
        working_directory: workingDirectory.trim() || undefined,
        model,
        max_turns: maxTurns,
      };
      createAgent.mutate(request, { onSuccess: onClose });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-panel-surface border border-panel-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-panel-border">
          <h2 className="text-panel-text text-base font-semibold">
            {isEdit ? "Edit Agent" : "Create Agent"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-panel-text-dim hover:text-panel-text transition-colors p-1 rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              required
              className={inputClass}
            />
          </Field>

          {/* Role */}
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {/* System Prompt */}
          <Field label="System Prompt">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Optional system instructions..."
              rows={4}
              className={cn(inputClass, "resize-none")}
            />
          </Field>

          {/* Working Directory */}
          <Field label="Working Directory">
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/project"
              className={inputClass}
            />
          </Field>

          {/* Model + Max Turns row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Model">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelType)}
                className={inputClass}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Max Turns">
              <input
                type="number"
                value={maxTurns}
                onChange={(e) => setMaxTurns(parseInt(e.target.value, 10) || 1)}
                min={1}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-panel-text-dim hover:text-panel-text border border-panel-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className={cn(
                "px-5 py-2 text-sm font-medium rounded-lg transition-colors",
                "bg-panel-accent text-white hover:bg-panel-accent/80",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isPending ? "Saving..." : isEdit ? "Update Agent" : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent focus:border-panel-accent transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-panel-text-dim mb-1.5">{label}</span>
      {children}
    </label>
  );
}
