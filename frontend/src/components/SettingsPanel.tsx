import React from "react";
import { isAuthenticated, clearAuth } from "../lib/api";

export default function SettingsPanel() {
  const [authed, setAuthed] = React.useState(isAuthenticated);

  function onDisconnect() {
    clearAuth();
    setAuthed(false);
  }

  return (
    <div className="p-3 border border-border rounded-xl bg-card text-foreground">
      {authed ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-success font-medium">✓ FPL account connected</span>
          <button className="btn text-sm" type="button" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not connected. Switch to Live mode to connect your FPL account.
        </p>
      )}
    </div>
  );
}
