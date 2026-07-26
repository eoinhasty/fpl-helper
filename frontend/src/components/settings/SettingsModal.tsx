import * as React from "react";
import SettingsPanel from "./SettingsPanel";
import Card from "../ui/Card";
import { Segmented } from "../controls/Segmented";
import { usePreferences, type Theme, type DefaultView, type SquadLayout } from "../../hooks/usePreferences";

type Props = {
  open: boolean;
  onClose: () => void;
  entry: number | "";
  setEntry: (v: number | "") => void;
};

export default function SettingsModal({ open, onClose, entry, setEntry }: Props) {
  const { prefs, set, reset } = usePreferences();
  const [confirmingReset, setConfirmingReset] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) setConfirmingReset(false);
  }, [open]);

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
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4 pb-3">
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
            {entry !== "" && (!Number.isInteger(entry) || entry <= 0) && (
              <p className="text-xs text-destructive mt-1">Entry ID must be a positive whole number.</p>
            )}

            <div className="text-sm font-semibold mt-5 mb-2">FPL Account</div>
            <SettingsPanel />
          </Card>

          {/* Preferences */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Preferences</div>

            {/* Theme */}
            <label className="block text-sm mb-1">Theme</label>
            <Segmented<Theme>
              value={prefs.theme}
              onChange={(v) => set("theme", v)}
              options={(["system", "light", "dark"] as Theme[]).map((t) => ({
                value: t,
                label: t[0].toUpperCase() + t.slice(1),
              }))}
              className="mb-3"
              ariaLabel="Theme"
            />

            {/* Defaults */}
            <div className="mt-4">
              <label className="block text-sm mb-1">Default view</label>
              <Segmented<DefaultView>
                value={prefs.defaultView}
                onChange={(v) => set("defaultView", v)}
                options={(["squad", "live"] as DefaultView[]).map((v) => ({ value: v, label: v }))}
                ariaLabel="Default view"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm mb-1">Squad layout</label>
              <Segmented<SquadLayout>
                value={prefs.squadLayout}
                onChange={(v) => set("squadLayout", v)}
                options={(["list", "pitch"] as SquadLayout[]).map((v) => ({ value: v, label: v }))}
                ariaLabel="Squad layout"
              />
            </div>

            {/* Reset */}
            <div className="mt-6 pt-4 border-t border-border">
              {confirmingReset ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Reset theme, default view, and squad layout?</span>
                  <button
                    onClick={() => {
                      reset();
                      setConfirmingReset(false);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-border bg-destructive/10 text-destructive hover:bg-destructive/15 transition
                               focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    type="button"
                  >
                    Confirm reset
                  </button>
                  <button
                    onClick={() => setConfirmingReset(false)}
                    className="btn"
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingReset(true)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-destructive/10 text-destructive hover:bg-destructive/15 transition
                             focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  type="button"
                >
                  Reset preferences
                </button>
              )}
            </div>
          </Card>
        </div>
        <p className="col-span-full text-xs text-muted-foreground/60 text-center pt-1">
          Not affiliated with Fantasy Premier League or the Premier League.{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">
            Privacy policy
          </a>
        </p>
      </div>
    </div>
  );
}
