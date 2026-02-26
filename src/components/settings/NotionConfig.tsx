import { useState, useEffect } from "react";
import { BookOpen, Save, RefreshCw, Loader2 } from "lucide-react";
import { useSaveSettings, useSettings } from "../../hooks/useSettings";
import { syncNotion } from "../../lib/tauri";
import { toast } from "sonner";

export default function NotionConfig() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();

  const [apiKey, setApiKey] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Load existing settings
  useEffect(() => {
    if (settings?.values) {
      setApiKey(settings.values["notion_api_key"] ?? "");
      setDatabaseId(settings.values["notion_database_id"] ?? "");
    }
  }, [settings]);

  const handleSave = () => {
    saveSettings.mutate({
      notion_api_key: apiKey,
      notion_database_id: databaseId,
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const tasks = await syncNotion();
      toast.success(`Synced ${tasks.length} tasks from Notion`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Notion sync failed: ${message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen size={16} className="text-panel-accent" />
        <h3 className="text-sm font-semibold text-panel-text">
          Notion Configuration
        </h3>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs text-panel-text-dim mb-1">
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="ntn_..."
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
        />
        <p className="text-[10px] text-panel-text-dim/60 mt-1">
          Create an integration at notion.so/my-integrations
        </p>
      </div>

      {/* Database ID */}
      <div>
        <label className="block text-xs text-panel-text-dim mb-1">
          Database ID
        </label>
        <input
          type="text"
          value={databaseId}
          onChange={(e) => setDatabaseId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
        />
        <p className="text-[10px] text-panel-text-dim/60 mt-1">
          The ID of the Notion database to sync tasks from
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveSettings.isPending}
          className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md bg-panel-accent text-white hover:bg-panel-accent/90 transition-colors disabled:opacity-40"
        >
          {saveSettings.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || !apiKey || !databaseId}
          className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md bg-panel-surface border border-panel-border text-panel-text hover:bg-panel-border/50 transition-colors disabled:opacity-40"
        >
          {syncing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          Sync Now
        </button>
      </div>
    </div>
  );
}
