import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SkillDefinition } from "../../lib/types";
import { saveSkill } from "../../lib/tauri";
import { toast } from "sonner";

interface SkillEditorProps {
  skill?: SkillDefinition;
  onClose: () => void;
}

export default function SkillEditor({ skill, onClose }: SkillEditorProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [triggers, setTriggers] = useState(
    skill?.triggers.join(", ") ?? ""
  );
  const [tags, setTags] = useState(skill?.tags.join(", ") ?? "");
  const [instructions, setInstructions] = useState(
    skill?.instructions ?? ""
  );

  const saveMutation = useMutation({
    mutationFn: (skillDef: SkillDefinition) => saveSkill(skillDef),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast.success("Skill saved");
      onClose();
    },
    onError: (err: Error) =>
      toast.error(`Failed to save skill: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !instructions.trim()) return;

    const skillDef: SkillDefinition = {
      name: name.trim(),
      description: description.trim(),
      triggers: triggers
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      instructions: instructions.trim(),
    };

    saveMutation.mutate(skillDef);
  };

  const isEditing = !!skill;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-panel-surface border border-panel-border rounded-lg w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-panel-text">
            {isEditing ? "Edit Skill" : "Create Skill"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-panel-text-dim hover:text-panel-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Name */}
        <label className="block text-xs text-panel-text-dim mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. code-review"
          disabled={isEditing}
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3 disabled:opacity-60"
        />

        {/* Description */}
        <label className="block text-xs text-panel-text-dim mb-1">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this skill does..."
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3"
        />

        {/* Triggers */}
        <label className="block text-xs text-panel-text-dim mb-1">
          Triggers{" "}
          <span className="text-panel-text-dim/60">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={triggers}
          onChange={(e) => setTriggers(e.target.value)}
          placeholder="e.g. review, check-code, lint"
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3"
        />

        {/* Tags */}
        <label className="block text-xs text-panel-text-dim mb-1">
          Tags{" "}
          <span className="text-panel-text-dim/60">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. code, quality, review"
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-3"
        />

        {/* Instructions */}
        <label className="block text-xs text-panel-text-dim mb-1">
          Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Detailed instructions for how the agent should execute this skill..."
          rows={8}
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent mb-4 resize-y font-mono"
        />

        {/* Actions */}
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
            disabled={
              !name.trim() || !instructions.trim() || saveMutation.isPending
            }
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            {saveMutation.isPending ? "Saving..." : "Save Skill"}
          </button>
        </div>
      </form>
    </div>
  );
}
