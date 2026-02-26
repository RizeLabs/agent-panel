import { useQuery } from "@tanstack/react-query";
import { Wrench, Plus, Tag, Loader2, Zap } from "lucide-react";
import type { SkillDefinition } from "../../lib/types";
import { cn } from "../../lib/utils";
import { listSkills } from "../../lib/tauri";

interface SkillListProps {
  onSelect: (skill: SkillDefinition) => void;
  onCreate: () => void;
}

export default function SkillList({ onSelect, onCreate }: SkillListProps) {
  const {
    data: skills,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench size={20} className="text-panel-accent" />
          <h2 className="text-lg font-semibold text-panel-text">Skills</h2>
          {skills && (
            <span className="text-xs text-panel-text-dim">
              {skills.length} skills
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25 transition-colors"
        >
          <Plus size={14} />
          Create Skill
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-panel-text-dim animate-spin" />
        </div>
      ) : isError ? (
        <div className="bg-panel-surface border border-panel-error/30 rounded-lg p-4 text-center">
          <p className="text-xs text-panel-error">
            Failed to load skills: {(error as Error).message}
          </p>
        </div>
      ) : skills && skills.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill: SkillDefinition) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="bg-panel-surface border border-panel-border rounded-lg p-8 text-center">
          <Wrench
            size={32}
            className="text-panel-text-dim mx-auto mb-3 opacity-40"
          />
          <p className="text-sm text-panel-text-dim">No skills defined</p>
          <p className="text-xs text-panel-text-dim/70 mt-1">
            Create a skill to give agents reusable capabilities
          </p>
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  onSelect,
}: {
  skill: SkillDefinition;
  onSelect: (skill: SkillDefinition) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(skill)}
      className={cn(
        "w-full text-left bg-panel-surface border border-panel-border rounded-lg p-4",
        "hover:border-panel-accent transition-colors duration-150 cursor-pointer",
        "focus:outline-none focus:ring-1 focus:ring-panel-accent"
      )}
    >
      {/* Name */}
      <div className="flex items-center gap-2 mb-2">
        <Zap size={14} className="text-panel-accent shrink-0" />
        <span className="text-sm font-medium text-panel-text truncate">
          {skill.name}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-panel-text-dim leading-relaxed mb-3 line-clamp-2">
        {skill.description || "No description"}
      </p>

      {/* Triggers */}
      {skill.triggers.length > 0 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <Zap size={10} className="text-panel-text-dim shrink-0" />
          {skill.triggers.slice(0, 3).map((trigger) => (
            <span
              key={trigger}
              className="text-[10px] bg-panel-accent/10 text-panel-accent rounded px-1.5 py-0.5"
            >
              {trigger}
            </span>
          ))}
          {skill.triggers.length > 3 && (
            <span className="text-[10px] text-panel-text-dim">
              +{skill.triggers.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Tags */}
      {skill.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Tag size={10} className="text-panel-text-dim shrink-0" />
          {skill.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[10px] bg-panel-border/50 text-panel-text-dim rounded px-1.5 py-0.5"
            >
              {tag}
            </span>
          ))}
          {skill.tags.length > 4 && (
            <span className="text-[10px] text-panel-text-dim">
              +{skill.tags.length - 4}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
