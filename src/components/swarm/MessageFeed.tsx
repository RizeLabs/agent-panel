import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
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
};

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
        {message.content}
      </div>

      {/* Timestamp + recipient */}
      <div className="flex items-center gap-2 text-[10px] text-panel-text-dim">
        <span>{timeAgo(message.created_at)}</span>
        {message.to_agent && <span>to {message.to_agent}</span>}
      </div>
    </div>
  );
}
