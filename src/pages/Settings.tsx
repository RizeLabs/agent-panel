import { useState } from "react";
import { Settings as SettingsIcon, Send, BookOpen } from "lucide-react";
import { cn } from "../lib/utils";
import GeneralSettings from "../components/settings/GeneralSettings";
import TelegramConfig from "../components/settings/TelegramConfig";
import NotionConfig from "../components/settings/NotionConfig";

type SettingsTab = "general" | "telegram" | "notion";

const tabs: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
  { key: "general", label: "General", icon: SettingsIcon },
  { key: "telegram", label: "Telegram", icon: Send },
  { key: "notion", label: "Notion", icon: BookOpen },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Page Header */}
      <div className="flex items-center gap-3 shrink-0">
        <SettingsIcon size={22} className="text-panel-accent" />
        <h1 className="text-xl font-semibold text-panel-text">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Tab Navigation (vertical) */}
        <nav className="flex flex-col gap-1 w-44 shrink-0">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                activeTab === key
                  ? "bg-panel-accent/15 text-panel-accent"
                  : "text-panel-text-dim hover:text-panel-text hover:bg-panel-border/30"
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="flex-1 bg-panel-surface border border-panel-border rounded-lg p-5 overflow-y-auto">
          {activeTab === "general" && <GeneralSettings />}
          {activeTab === "telegram" && <TelegramConfig />}
          {activeTab === "notion" && <NotionConfig />}
        </div>
      </div>
    </div>
  );
}
