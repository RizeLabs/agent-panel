import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
  Plus,
  Tag,
  Loader2,
  Zap,
  Link,
  FolderOpen,
  X,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import type { SkillDefinition } from "../../lib/types";
import { cn } from "../../lib/utils";
import {
  listSkills,
  importSkillFromUrl,
  importSkillsFromPath,
} from "../../lib/tauri";

interface SkillListProps {
  onSelect: (skill: SkillDefinition) => void;
  onCreate: () => void;
}

export default function SkillList({ onSelect, onCreate }: SkillListProps) {
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"url" | "path">("path");
  const [importValue, setImportValue] = useState("");
  const [importing, setImporting] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: skills,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills,
  });

  const handleImport = async () => {
    const value = importValue.trim();
    if (!value) return;
    setImporting(true);
    try {
      if (importMode === "url") {
        const skill = await importSkillFromUrl(value);
        toast.success(`Imported skill "${skill.name}"`);
      } else {
        const skills = await importSkillsFromPath(value);
        const names = skills.map((s) => s.name).join(", ");
        toast.success(
          skills.length === 1
            ? `Imported skill "${names}"`
            : `Imported ${skills.length} skills: ${names}`
        );
      }
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      setImportValue("");
      setShowImport(false);
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    setShowImport(false);
    setImportValue("");
  };

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors",
              showImport
                ? "bg-panel-accent text-white"
                : "bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25"
            )}
          >
            <Download size={14} />
            Import
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-panel-accent/15 text-panel-accent hover:bg-panel-accent/25 transition-colors"
          >
            <Plus size={14} />
            Create Skill
          </button>
        </div>
      </div>

      {/* Import bar */}
      {showImport && (
        <div className="bg-panel-surface border border-panel-border rounded-lg p-3 space-y-2.5">
          {/* Mode toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setImportMode("path");
                setImportValue("");
              }}
              className={cn(
                "flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors",
                importMode === "path"
                  ? "bg-panel-accent text-white"
                  : "text-panel-text-dim hover:text-panel-text"
              )}
            >
              <FolderOpen size={12} />
              Local Path
            </button>
            <button
              type="button"
              onClick={() => {
                setImportMode("url");
                setImportValue("");
              }}
              className={cn(
                "flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors",
                importMode === "url"
                  ? "bg-panel-accent text-white"
                  : "text-panel-text-dim hover:text-panel-text"
              )}
            >
              <Link size={12} />
              GitHub URL
            </button>
          </div>
          {/* Input row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
              placeholder={
                importMode === "path"
                  ? "/path/to/skills/ or /path/to/skill.md"
                  : "https://github.com/user/repo/blob/main/skill.md"
              }
              className="flex-1 bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
              disabled={importing}
            />
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !importValue.trim()}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {importing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {importing ? "Importing..." : "Import"}
            </button>
            <button
              type="button"
              onClick={closeImport}
              className="text-panel-text-dim hover:text-panel-text transition-colors p-1 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-[10px] text-panel-text-dim/60">
            {importMode === "path"
              ? "Point to a .md file or a directory of .md files. Each must have YAML frontmatter (--- delimiters)."
              : "Paste a GitHub .md link — blob URLs are auto-converted to raw."}
          </p>
        </div>
      )}

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
