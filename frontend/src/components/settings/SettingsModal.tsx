import * as React from "react";
import SettingsPanel from "../SettingsPanel";
import Card from "../ui/Card";
import { usePreferences, type Theme, type DefaultView, type SquadLayout } from "../../hooks/usePreferences";

type Props = {
  open: boolean;
  onClose: () => void;
  entry: number | "";
  setEntry: (v: number | "") => void;
};

export default function SettingsModal({ open, onClose, entry, setEntry }: Props) {
  const { prefs, set, reset } = usePreferences();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" onClick={onClose} />

      {/* modal */}
      <div className="absolute left-1/2 top-10 -translate-x-1/2 w-[min(56rem,_92vw)] rounded-2xl bg-card text-foreground shadow-card border border-border overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="btn"
            aria-label="Close settings"
          >
            Close
          </button>
        </div>

        {/* body */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Account & Token */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Account</div>

            <label className="block text-sm mb-1">Your FPL Entry ID</label>
            <div className="flex gap-2">
              <input
                className="input"
                type="number"
                placeholder="1234567"
                value={entry}
                onChange={(e) => setEntry(e.target.value === "" ? "" : Number(e.target.value))}
                autoComplete="off"
              />
              <button onClick={() => setEntry("")} className="btn" type="button">
                Clear
              </button>
            </div>

            <div className="text-sm font-semibold mt-5 mb-2">Bearer Token</div>
            <SettingsPanel />
          </Card>

          {/* Preferences */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Preferences</div>

            {/* Theme */}
            <label className="block text-sm mb-1">Theme</label>
            <div className="flex gap-2 mb-3">
              {(["system", "light", "dark"] as Theme[]).map((t) => {
                const active = prefs.theme === t;
                return (
                  <button
                    key={t}
                    onClick={() => set("theme", t)}
                    className={`px-3 py-1.5 rounded-lg border border-border transition
                      ${active ? "bg-primary text-primary-foreground border-0" : "bg-card text-foreground border-border hover:bg-accent"}
                      focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
                    `}
                    aria-pressed={active}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                );
              })}
            </div>

            {/* Toggles */}
            <Toggle
              checked={prefs.compactCards}
              onChange={(v) => set("compactCards", v)}
              label="Compact player cards"
            />
            <Toggle
              checked={prefs.showXBadges}
              onChange={(v) => set("showXBadges", v)}
              label="Show xGI/xCS badges"
            />

            {/* Defaults */}
            <div className="mt-4">
              <label className="block text-sm mb-1">Default view</label>
              <div className="flex gap-2">
                {(["squad", "live"] as DefaultView[]).map((v) => {
                  const active = prefs.defaultView === v;
                  return (
                    <button
                      key={v}
                      onClick={() => set("defaultView", v)}
                      className={`px-3 py-1.5 rounded-lg border border-border transition
                        ${active ? "bg-primary text-primary-foreground border-0" : "bg-card text-foreground border-border hover:bg-accent"}
                        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
                      `}
                      aria-pressed={active}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm mb-1">Squad layout</label>
              <div className="flex gap-2">
                {(["list", "pitch"] as SquadLayout[]).map((v) => {
                  const active = prefs.squadLayout === v;
                  return (
                    <button
                      key={v}
                      onClick={() => set("squadLayout", v)}
                      className={`px-3 py-1.5 rounded-lg border border-border transition
                        ${active ? "bg-primary text-primary-foreground border-0" : "bg-card text-foreground border-border hover:bg-accent"}
                        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
                      `}
                      aria-pressed={active}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reset */}
            <div className="mt-6 pt-4 border-t border-border">
              <button
                onClick={reset}
                className="px-3 py-1.5 rounded-lg border border-border bg-destructive/10 text-destructive hover:bg-destructive/15 transition
                           focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                type="button"
              >
                Reset preferences
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full border border-border relative transition
          ${checked ? "bg-primary border-transparent" : "bg-muted border-border"}
          focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
        `}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card border border-border transition-transform
            ${checked ? "translate-x-4" : ""}
          `}
        />
      </button>
    </label>
  );
}
