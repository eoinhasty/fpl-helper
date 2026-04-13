import React from 'react';

const STORAGE_KEY = "fpl_token";

function maskToken(tok: string): string {
  if (tok.length <= 10) return "*".repeat(tok.length);
  return `${tok.slice(0, 5)}…${tok.slice(-4)}`;
}

export default function SettingsPanel() {
  const [token, setLocal] = React.useState('');
  const [status, setStatus] = React.useState<'idle'|'saved'|'cleared'>('idle');

  // Read current stored token on mount
  const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  const [active, setActive] = React.useState<boolean>(Boolean(stored));
  const [masked, setMasked] = React.useState<string | null>(stored ? maskToken(stored) : null);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    const tok = token.trim();
    if (!tok) return;
    localStorage.setItem(STORAGE_KEY, tok);
    setActive(true);
    setMasked(maskToken(tok));
    setLocal('');
    setStatus('saved');
  }

  function onClear() {
    localStorage.removeItem(STORAGE_KEY);
    setActive(false);
    setMasked(null);
    setLocal('');
    setStatus('cleared');
  }

  return (
    <div className="p-3 border border-border rounded-xl bg-card text-foreground">

      <div className="text-sm mb-3">
        <div>Token status: {active ? '✅ active' : '❌ not set'}</div>
        {masked && (
          <div className="text-muted-foreground">
            Current: <code>{masked}</code>
          </div>
        )}
      </div>

      <form onSubmit={onSave} className="flex flex-col gap-2">
        <label className="text-sm">
          Paste <code>X-Api-Authorization</code> value
        </label>
        <input
          value={token}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Bearer eyJhbGciOi..."
          className="input"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <button className="btn text-sm" type="submit">
            Save
          </button>
          <button className="btn text-sm" type="button" onClick={onClear}>
            Clear
          </button>
        </div>

        {status === 'saved' && <div className="text-xs text-success">Saved.</div>}
        {status === 'cleared' && <div className="text-xs text-muted-foreground">Token cleared.</div>}
      </form>
    </div>
  );
}
