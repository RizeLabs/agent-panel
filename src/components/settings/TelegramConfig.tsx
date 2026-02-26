import { useState, useEffect } from "react";
import { Send, Save, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useSaveSettings, useSettings } from "../../hooks/useSettings";
import { testTelegram } from "../../lib/tauri";
import { toast } from "sonner";

export default function TelegramConfig() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();

  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Load existing settings
  useEffect(() => {
    if (settings?.values) {
      setBotToken(settings.values["telegram_bot_token"] ?? "");
      setChatId(settings.values["telegram_chat_id"] ?? "");
    }
  }, [settings]);

  const handleSave = () => {
    saveSettings.mutate({
      telegram_bot_token: botToken,
      telegram_chat_id: chatId,
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testTelegram();
      setTestResult({ success: true, message: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTestResult({ success: false, message });
      toast.error(`Telegram test failed: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Send size={16} className="text-panel-accent" />
        <h3 className="text-sm font-semibold text-panel-text">
          Telegram Configuration
        </h3>
      </div>

      {/* Bot Token */}
      <div>
        <label className="block text-xs text-panel-text-dim mb-1">
          Bot Token
        </label>
        <input
          type="password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
        />
        <p className="text-[10px] text-panel-text-dim/60 mt-1">
          Get this from @BotFather on Telegram
        </p>
      </div>

      {/* Chat ID */}
      <div>
        <label className="block text-xs text-panel-text-dim mb-1">
          Chat ID
        </label>
        <input
          type="text"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="-1001234567890"
          className="w-full bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text placeholder:text-panel-text-dim/50 focus:outline-none focus:ring-1 focus:ring-panel-accent font-mono"
        />
        <p className="text-[10px] text-panel-text-dim/60 mt-1">
          The chat or group ID to send messages to
        </p>
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 p-2.5 rounded-md border text-xs ${
            testResult.success
              ? "bg-panel-success/10 border-panel-success/30 text-panel-success"
              : "bg-panel-error/10 border-panel-error/30 text-panel-error"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 size={14} />
          ) : (
            <XCircle size={14} />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

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
          onClick={handleTest}
          disabled={testing || !botToken || !chatId}
          className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md bg-panel-surface border border-panel-border text-panel-text hover:bg-panel-border/50 transition-colors disabled:opacity-40"
        >
          {testing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Send size={13} />
          )}
          Test Connection
        </button>
      </div>
    </div>
  );
}
