import { useState } from "react";
import { Play, X, Clock } from "lucide-react";
import { cn, timeAgo } from "../../lib/utils";
import type { CronJob } from "../../lib/types";
import { useAgents } from "../../hooks/useAgents";
import {
  useCronJobs,
  useCreateCronJob,
  useUpdateCronJob,
  useDeleteCronJob,
  useTriggerCronJob,
} from "../../hooks/useCronJobs";

// ─── Helpers ──────────────────────────────────────────────────

function formatInterval(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function timeUntil(isoStr: string): string {
  const diff = Math.floor((new Date(isoStr).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const PRESET_INTERVALS = [
  { label: "5 min", secs: 300 },
  { label: "15 min", secs: 900 },
  { label: "30 min", secs: 1800 },
  { label: "1 hour", secs: 3600 },
  { label: "6 hours", secs: 21600 },
  { label: "12 hours", secs: 43200 },
  { label: "24 hours", secs: 86400 },
];

// ─── Job Row ──────────────────────────────────────────────────

function JobRow({
  job,
  agentName,
}: {
  job: CronJob;
  agentName: string;
}) {
  const updateJob = useUpdateCronJob();
  const deleteJob = useDeleteCronJob();
  const triggerJob = useTriggerCronJob();

  const toggleEnabled = () => {
    updateJob.mutate({ ...job, enabled: !job.enabled });
  };

  return (
    <div className="flex flex-col gap-1 px-4 py-3 border-b border-panel-border last:border-0 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-2">
        {/* Enable/disable toggle */}
        <button
          type="button"
          onClick={toggleEnabled}
          className={cn(
            "w-3 h-3 rounded-full border flex-shrink-0 transition-colors",
            job.enabled
              ? "bg-panel-success border-panel-success"
              : "bg-transparent border-panel-text-dim"
          )}
          title={job.enabled ? "Disable" : "Enable"}
        />

        {/* Name */}
        <span className="flex-1 text-sm font-medium text-panel-text truncate">
          {job.name}
        </span>

        {/* Interval */}
        <span className="text-xs text-panel-text-dim flex items-center gap-1">
          <Clock size={10} />
          every {formatInterval(job.interval_secs)}
        </span>

        {/* Arrow */}
        <span className="text-panel-text-dim text-xs">→</span>

        {/* Agent */}
        <span className="text-xs text-panel-accent font-mono truncate max-w-[100px]">
          {agentName}
        </span>

        {/* Run button */}
        <button
          type="button"
          onClick={() => triggerJob.mutate(job.id)}
          disabled={triggerJob.isPending}
          className="p-1 rounded text-panel-text-dim hover:text-panel-accent hover:bg-panel-accent/10 transition-colors"
          title="Run now"
        >
          <Play size={11} />
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={() => deleteJob.mutate(job.id)}
          disabled={deleteJob.isPending}
          className="p-1 rounded text-panel-text-dim hover:text-panel-error hover:bg-panel-error/10 transition-colors"
          title="Delete"
        >
          <X size={11} />
        </button>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 pl-5 text-xs text-panel-text-dim">
        <span>Next in {timeUntil(job.next_run_at)}</span>
        {job.last_run_at && <span>Last {timeAgo(job.last_run_at)}</span>}
        <span>{job.run_count} runs</span>
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px]",
            job.action_type === "inject_context"
              ? "bg-amber-500/15 text-amber-400"
              : "bg-emerald-500/15 text-emerald-400"
          )}
        >
          {job.action_type}
        </span>
        {job.description && (
          <span className="italic truncate">{job.description}</span>
        )}
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const { data: agents = [] } = useAgents();
  const createJob = useCreateCronJob();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [intervalSecs, setIntervalSecs] = useState(3600);
  const [customInterval, setCustomInterval] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [actionType, setActionType] = useState<
    "post_message" | "inject_context"
  >("post_message");
  const [payload, setPayload] = useState("");

  const effectiveInterval = useCustom
    ? Number(customInterval) || 3600
    : intervalSecs;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !agentId || !payload.trim()) return;

    createJob.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        interval_secs: effectiveInterval,
        agent_id: agentId,
        action_type: actionType,
        payload: payload.trim(),
      },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel-surface border border-panel-border rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
          <h3 className="text-sm font-semibold text-panel-text">
            New Cron Job
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-panel-text-dim hover:text-panel-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-panel-text-dim">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Monitor GitHub issues"
              className="bg-panel-bg border border-panel-border rounded px-3 py-1.5 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:border-panel-accent"
              required
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-panel-text-dim">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="bg-panel-bg border border-panel-border rounded px-3 py-1.5 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:border-panel-accent resize-none"
            />
          </div>

          {/* Agent */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-panel-text-dim">Agent *</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="bg-panel-bg border border-panel-border rounded px-3 py-1.5 text-sm text-panel-text focus:outline-none focus:border-panel-accent"
              required
            >
              <option value="">Select an agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Interval */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-panel-text-dim">Interval</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_INTERVALS.map((p) => (
                <button
                  key={p.secs}
                  type="button"
                  onClick={() => {
                    setIntervalSecs(p.secs);
                    setUseCustom(false);
                  }}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    !useCustom && intervalSecs === p.secs
                      ? "bg-panel-accent text-white"
                      : "bg-panel-bg border border-panel-border text-panel-text-dim hover:text-panel-text"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUseCustom(true)}
                className={cn(
                  "px-2 py-1 rounded text-xs transition-colors",
                  useCustom
                    ? "bg-panel-accent text-white"
                    : "bg-panel-bg border border-panel-border text-panel-text-dim hover:text-panel-text"
                )}
              >
                Custom
              </button>
            </div>
            {useCustom && (
              <input
                type="number"
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
                placeholder="Seconds"
                min={30}
                className="bg-panel-bg border border-panel-border rounded px-3 py-1.5 text-sm text-panel-text focus:outline-none focus:border-panel-accent mt-1"
              />
            )}
          </div>

          {/* Action type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-panel-text-dim">Action Type</label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="post_message"
                  checked={actionType === "post_message"}
                  onChange={() => setActionType("post_message")}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm text-panel-text">post_message</span>
                  <p className="text-xs text-panel-text-dim">
                    Queued delivery via breathe loop (≤60 s)
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="inject_context"
                  checked={actionType === "inject_context"}
                  onChange={() => setActionType("inject_context")}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm text-panel-text">
                    inject_context
                  </span>
                  <p className="text-xs text-panel-text-dim">
                    Immediate restart with injected context
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Payload */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-panel-text-dim">
              {actionType === "post_message"
                ? "Message payload *"
                : "Context to inject *"}
            </label>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={3}
              placeholder={
                actionType === "post_message"
                  ? "Check the repo for new open issues and summarize findings."
                  : "Review current task progress and reprioritize if needed."
              }
              className="bg-panel-bg border border-panel-border rounded px-3 py-1.5 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:border-panel-accent resize-none"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-panel-text-dim hover:text-panel-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createJob.isPending}
              className="px-3 py-1.5 text-xs bg-panel-accent text-white rounded hover:bg-panel-accent/80 disabled:opacity-50 transition-colors"
            >
              {createJob.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function CronJobs() {
  const { data: jobs = [], isLoading } = useCronJobs();
  const { data: agents = [] } = useAgents();
  const [showCreate, setShowCreate] = useState(false);

  const agentNameById = Object.fromEntries(
    agents.map((a) => [a.id, a.name])
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-panel-border shrink-0">
        <span className="text-xs font-medium text-panel-text-dim uppercase tracking-wider">
          Scheduled Jobs ({jobs.length})
        </span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="text-xs px-2.5 py-1 bg-panel-accent/10 border border-panel-accent/30 text-panel-accent rounded hover:bg-panel-accent/20 transition-colors"
        >
          + New Job
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-panel-text-dim text-sm">
            Loading…
          </div>
        )}

        {!isLoading && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm text-panel-text-dim">No cron jobs yet.</p>
            <p className="text-xs text-panel-text-dim/60">
              Create one to give agents persistent recurring tasks.
            </p>
          </div>
        )}

        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            agentName={agentNameById[job.agent_id] ?? job.agent_id}
          />
        ))}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
