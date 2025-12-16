import React from 'react';
import { setToken, getTokenStatus } from '../lib/api';

export default function SettingsPanel() {
  const [token, setLocal] = React.useState('');
  const [status, setStatus] = React.useState<'idle'|'saving'|'ok'|'err'>('idle');
  const [active, setActive] = React.useState<boolean | null>(null);
  const [masked, setMasked] = React.useState<string | null>(null);

  React.useEffect(() => {
    getTokenStatus().then(s => setActive(s.active)).catch(() => setActive(null));
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    try {
      const res = await setToken(token || null);
      setMasked(res.masked ?? null);
      setActive(res.active);
      setStatus('ok');
    } catch {
      setStatus('err');
    }
  }

  async function onClear() {
    setStatus('saving');
    try {
      const res = await setToken(null);
      setMasked(res.masked ?? null);
      setActive(res.active);
      setLocal('');
      setStatus('ok');
    } catch {
      setStatus('err');
    }
  }

  return (
    <div className="p-3 border border-border rounded-xl bg-card text-foreground">
      
      <div className="text-sm mb-3">
        <div>Token status: {active == null ? '—' : active ? '✅ active' : '❌ not set'}</div>
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
          <button className="btn text-sm" type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button className="btn text-sm" type="button" onClick={onClear} disabled={status === 'saving'}>
            Clear
          </button>
        </div>

        {status === 'ok' && <div className="text-xs text-success">Saved.</div>}
        {status === 'err' && <div className="text-xs text-destructive">Error saving token.</div>}
      </form>

      {/* Optional: keep your existing dev-only Reload .env action here */}
      {/* <button onClick={reloadEnv}>Reload .env</button> */}
    </div>
  );
}