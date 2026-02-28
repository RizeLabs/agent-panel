import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Loader2, ChevronRight, ChevronDown, Terminal } from "lucide-react";
import type { Message, MessageType } from "../../lib/types";
import { cn, timeAgo } from "../../lib/utils";
import { useMessages, usePostMessage } from "../../hooks/useMessages";

const roleColors: Record<string, string> = {
  coder: "text-blue-400",
  researcher: "text-emerald-400",
  content: "text-amber-400",
  coordinator: "text-purple-400",
  user: "text-panel-accent",
};

const typeBadgeColors: Record<string, string> = {
  insight: "bg-emerald-500/15 text-emerald-400",
  question: "bg-blue-500/15 text-blue-400",
  task_update: "bg-amber-500/15 text-amber-400",
  finding: "bg-cyan-500/15 text-cyan-400",
  request: "bg-panel-accent/15 text-panel-accent",
  response: "bg-gray-500/15 text-gray-400",
  completion_report: "bg-purple-500/15 text-purple-400",
  chat: "bg-gray-500/15 text-gray-400",
  cron_trigger: "bg-orange-500/15 text-orange-400",
};

// ─── Tool call chip ──────────────────────────────────────────

function ToolCallChip({ name, input }: { name: string; input: string }) {
  const [open, setOpen] = useState(false);
  let pretty = input;
  try {
    pretty = JSON.stringify(JSON.parse(input), null, 2);
  } catch {}

  return (
    <div className="rounded border border-panel-border/50 bg-panel-bg/40 text-[10px]">
      <button
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left hover:bg-panel-surface/40"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown size={9} className="text-purple-400 shrink-0" />
        ) : (
          <ChevronRight size={9} className="text-purple-400 shrink-0" />
        )}
        <Terminal size={9} className="text-purple-400 shrink-0" />
        <span className="font-semibold text-purple-300">{name}</span>
        {!open && (
          <span className="text-panel-text-dim truncate max-w-[220px]">
            {input.slice(0, 80)}{input.length > 80 ? "…" : ""}
          </span>
        )}
      </button>
      {open && (
        <pre className="px-3 pb-2 text-[9px] text-panel-text-dim overflow-x-auto leading-relaxed">
          {pretty}
        </pre>
      )}
    </div>
  );
}

// ─── Completion report renderer ──────────────────────────────

function CompletionReportContent({ content }: { content: string }) {
  const [workExpanded, setWorkExpanded] = useState(false);

  const lines = content.split("\n");
  let agentId = "";
  let taskId = "";
  let workOutputStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Agent: ")) agentId = lines[i].slice("Agent: ".length);
    if (lines[i].startsWith("Task ID: ")) taskId = lines[i].slice("Task ID: ".length);
    if (lines[i].startsWith("Work output:")) { workOutputStart = i + 1; break; }
  }

  const workText = workOutputStart >= 0 ? lines.slice(workOutputStart).join("\n") : content;

  type Segment =
    | { type: "tool"; name: string; input: string }
    | { type: "prose"; text: string };

  const segments: Segment[] = [];
  for (const line of workText.split("\n")) {
    const m = line.match(/^\[Tool: ([^\]]+)\] (.*)/s);
    if (m) {
      segments.push({ type: "tool", name: m[1], input: m[2] });
    } else if (line.trim()) {
      segments.push({ type: "prose", text: line });
    }
  }

  const toolCount = segments.filter((s) => s.type === "tool").length;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="text-[10px] text-panel-text-dim space-y-0.5 pb-2 border-b border-panel-border/50">
        {agentId && (
          <div>
            Agent: <code className="text-panel-text">{agentId.slice(0, 8)}…</code>
          </div>
        )}
        {taskId && (
          <div>
            Task: <code className="text-panel-text">{taskId.slice(0, 8)}…</code>
          </div>
        )}
      </div>

      {/* Work output toggle */}
      <button
        onClick={() => setWorkExpanded((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] text-panel-accent hover:text-panel-accent/80 transition-colors"
      >
        {workExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Work output · {toolCount} tool call{toolCount !== 1 ? "s" : ""}
      </button>

      {workExpanded && (
        <div className="space-y-1 pl-2 border-l border-panel-border/40">
          {segments.map((seg, i) =>
            seg.type === "tool" ? (
              <ToolCallChip key={i} name={seg.name} input={seg.input} />
            ) : (
              <p key={i} className="text-[10px] text-panel-text/80 leading-relaxed">
                {seg.text}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageFeed() {
  const { data: messages, isLoading } = useMessages();
  const postMessage = usePostMessage();
  const [input, setInput] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    postMessage.mutate({
      from_agent: "user",
      message_type: "request",
      content: input.trim(),
    });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-panel-border shrink-0">
        <MessageSquare size={15} className="text-panel-accent" />
        <span className="text-xs font-medium text-panel-text">
          Message Feed
        </span>
        {messages && (
          <span className="text-[10px] text-panel-text-dim ml-auto">
            {messages.length} messages
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-3"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2
              size={18}
              className="text-panel-text-dim animate-spin"
            />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: Message) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        ) : (
          <div className="text-center py-8">
            <MessageSquare
              size={24}
              className="text-panel-text-dim mx-auto mb-2 opacity-40"
            />
            <p className="text-xs text-panel-text-dim">No messages yet</p>
          </div>
        )}
      </div>

      {/* Compose Bar */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-3 py-2 border-t border-panel-border shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          className="flex-1 bg-panel-bg border border-panel-border rounded-md px-3 py-1.5 text-xs text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent"
        />
        <button
          type="submit"
          disabled={!input.trim() || postMessage.isPending}
          className="p-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {postMessage.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.from_agent === "user";
  const agentColor = roleColors[message.from_agent] ?? "text-panel-text";
  const badgeColor =
    typeBadgeColors[message.message_type] ?? "bg-gray-500/15 text-gray-400";

  return (
    <div
      className={cn(
        "flex flex-col gap-1 max-w-[85%]",
        isUser ? "ml-auto items-end" : "items-start"
      )}
    >
      {/* Agent name + type badge */}
      <div className="flex items-center gap-2">
        <span className={cn("text-[11px] font-medium", agentColor)}>
          {message.from_agent}
        </span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
            badgeColor
          )}
        >
          {message.message_type.replace("_", " ")}
        </span>
      </div>

      {/* Content */}
      <div
        className={cn(
          "text-xs text-panel-text leading-relaxed px-3 py-2 rounded-lg",
          isUser
            ? "bg-panel-accent/15 border border-panel-accent/30"
            : "bg-panel-surface border border-panel-border"
        )}
      >
        {message.message_type === "completion_report" ? (
          <CompletionReportContent content={message.content} />
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
      </div>

      {/* Timestamp + recipient */}
      <div className="flex items-center gap-2 text-[10px] text-panel-text-dim">
        <span>{timeAgo(message.created_at)}</span>
        {message.to_agent && <span>to {message.to_agent}</span>}
      </div>
    </div>
  );
}
