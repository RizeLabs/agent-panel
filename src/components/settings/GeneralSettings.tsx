import { useState, useEffect } from "react";
import { Settings, Save, Loader2 } from "lucide-react";
import { useSaveSettings, useSettings } from "../../hooks/useSettings";

interface IntervalSetting {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  unit: string;
}

const intervalSettings: IntervalSetting[] = [
  {
    key: "agent_health_check_interval",
    label: "Agent Health Check Interval",
    description: "How often to check if agents are alive and responding",
    defaultValue: 30,
    unit: "seconds",
  },
  {
    key: "breathe_loop_interval",
    label: "Breathe Loop Interval",
    description:
      "Interval for the agent breathing loop that processes pending work",
    defaultValue: 10,
    unit: "seconds",
  },
  {
    key: "coordinator_interval",
    label: "Coordinator Interval",
    description: "How often the coordinator checks for tasks to distribute",
    defaultValue: 60,
    unit: "seconds",
  },
];

export default function GeneralSettings() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const [values, setValues] = useState<Record<string, string>>({});

  // Load existing settings
  useEffect(() => {
    if (settings?.values) {
      const loaded: Record<string, string> = {};
      for (const setting of intervalSettings) {
        loaded[setting.key] =
          settings.values[setting.key] ?? String(setting.defaultValue);
      }
      setValues(loaded);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveSettings.mutate(values);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Settings size={16} className="text-panel-accent" />
        <h3 className="text-sm font-semibold text-panel-text">
          General Settings
        </h3>
      </div>

      {/* Interval settings */}
      <div className="space-y-4">
        {intervalSettings.map((setting) => (
          <div key={setting.key}>
            <label className="block text-xs text-panel-text-dim mb-1">
              {setting.label}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={values[setting.key] ?? String(setting.defaultValue)}
                onChange={(e) => handleChange(setting.key, e.target.value)}
                className="w-24 bg-panel-bg border border-panel-border rounded-md px-3 py-2 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
              />
              <span className="text-xs text-panel-text-dim">
                {setting.unit}
              </span>
            </div>
            <p className="text-[10px] text-panel-text-dim/60 mt-1">
              {setting.description}
            </p>
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="pt-2">
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
          Save Settings
        </button>
      </div>
    </div>
  );
}
