import { useState } from "react";
import { BookOpen, Search, Tag, Loader2 } from "lucide-react";
import type { Knowledge, KnowledgeCategory } from "../../lib/types";
import { cn, timeAgo } from "../../lib/utils";
import { useKnowledge } from "../../hooks/useMessages";

const categoryColors: Record<KnowledgeCategory, string> = {
  research: "bg-blue-500/15 text-blue-400",
  code_pattern: "bg-emerald-500/15 text-emerald-400",
  bug: "bg-red-500/15 text-red-400",
  decision: "bg-purple-500/15 text-purple-400",
  insight: "bg-amber-500/15 text-amber-400",
};

export default function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    undefined
  );

  const { data: entries, isLoading } = useKnowledge(
    selectedCategory,
    searchQuery || undefined
  );

  const categories: KnowledgeCategory[] = [
    "research",
    "code_pattern",
    "bug",
    "decision",
    "insight",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-panel-border shrink-0">
        <BookOpen size={15} className="text-panel-accent" />
        <span className="text-xs font-medium text-panel-text">
          Knowledge Base
        </span>
        {entries && (
          <span className="text-[10px] text-panel-text-dim ml-auto">
            {entries.length} entries
          </span>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-panel-border shrink-0">
        <div className="flex items-center flex-1 bg-panel-bg border border-panel-border rounded-md px-2">
          <Search size={13} className="text-panel-text-dim shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge..."
            className="flex-1 bg-transparent px-2 py-1.5 text-xs text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-panel-border overflow-x-auto shrink-0">
        <button
          type="button"
          onClick={() => setSelectedCategory(undefined)}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors",
            selectedCategory === undefined
              ? "bg-panel-accent text-white"
              : "bg-panel-border/50 text-panel-text-dim hover:text-panel-text"
          )}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() =>
              setSelectedCategory(
                selectedCategory === cat ? undefined : cat
              )
            }
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap capitalize transition-colors",
              selectedCategory === cat
                ? "bg-panel-accent text-white"
                : "bg-panel-border/50 text-panel-text-dim hover:text-panel-text"
            )}
          >
            {cat.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2
              size={18}
              className="text-panel-text-dim animate-spin"
            />
          </div>
        ) : entries && entries.length > 0 ? (
          entries.map((entry: Knowledge) => (
            <KnowledgeEntry key={entry.id} entry={entry} />
          ))
        ) : (
          <div className="text-center py-8">
            <BookOpen
              size={24}
              className="text-panel-text-dim mx-auto mb-2 opacity-40"
            />
            <p className="text-xs text-panel-text-dim">
              {searchQuery
                ? "No results found"
                : "No knowledge entries yet"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function KnowledgeEntry({ entry }: { entry: Knowledge }) {
  const [expanded, setExpanded] = useState(false);
  const badgeColor =
    categoryColors[entry.category as KnowledgeCategory] ??
    "bg-gray-500/15 text-gray-400";

  const tags = entry.tags
    ? entry.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const truncatedContent =
    entry.content.length > 150
      ? entry.content.slice(0, 150) + "..."
      : entry.content;

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left bg-panel-surface border border-panel-border rounded-lg p-3 hover:border-panel-accent/50 transition-colors"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
            badgeColor
          )}
        >
          {entry.category.replace("_", " ")}
        </span>
        <span className="text-xs font-medium text-panel-text flex-1 truncate">
          {entry.title}
        </span>
        <span className="text-[10px] text-panel-text-dim shrink-0">
          {timeAgo(entry.created_at)}
        </span>
      </div>

      {/* Content */}
      <p className="text-xs text-panel-text-dim leading-relaxed mb-2">
        {expanded ? entry.content : truncatedContent}
      </p>

      {/* Footer: agent + tags */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-panel-text-dim">
          by <span className="text-panel-text">{entry.agent_id}</span>
        </span>
        {tags.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <Tag size={10} className="text-panel-text-dim" />
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] bg-panel-border/50 text-panel-text-dim rounded px-1.5 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
