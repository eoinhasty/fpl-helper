import React from "react";
import { isAuthenticated, clearAuth } from "../../lib/api";

export default function SettingsPanel() {
  const [authed, setAuthed] = React.useState(isAuthenticated);

  function onDisconnect() {
    clearAuth();
    setAuthed(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-foreground">
      {authed ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-success">✓ FPL account connected</span>
          <button className="btn text-sm" type="button" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not connected. Switch to Live mode to connect your FPL account.</p>
      )}
    </div>
  );
}
