import * as React from "react";
import SettingsPanel from "./SettingsPanel";
import Card from "../ui/Card";
import Modal from "../ui/Modal";
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
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) setConfirmingReset(false);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="settings-modal-title"
      widthClass="w-[min(56rem,94vw)]"
      initialFocusRef={closeBtnRef}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-border shrink-0">
        <h2 id="settings-modal-title" className="text-lg font-semibold">Settings</h2>
        <button
          ref={closeBtnRef}
          onClick={onClose}
          className="btn"
          aria-label="Close settings"
        >
          Close
        </button>
      </div>

      {/* body */}
      <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4 pb-3 overflow-y-auto flex-1 min-h-0">
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
              options={(["squad", "live"] as DefaultView[]).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
              ariaLabel="Default view"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm mb-1">Squad layout</label>
            <Segmented<SquadLayout>
              value={prefs.squadLayout}
              onChange={(v) => set("squadLayout", v)}
              options={(["list", "pitch"] as SquadLayout[]).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
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
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                type="button"
              >
                Reset preferences
              </button>
            )}
          </div>
        </Card>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground/60 text-center px-4 sm:px-5 py-3 border-t border-border">
        Not affiliated with Fantasy Premier League or the Premier League.{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">
          Privacy policy
        </a>
      </p>
    </Modal>
  );
}
