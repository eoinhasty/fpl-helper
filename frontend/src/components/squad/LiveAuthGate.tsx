import React, { useState } from "react";
import Card from "../ui/Card";
import { ApiError, fplLogin, isAuthenticated } from "../../lib/api";

const CONSENT_KEY = "fpl_consent_v1";

function hasConsented(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

type Props = {
  children: React.ReactNode;
  onAuthenticated: () => void;
};

export default function LiveAuthGate({ children, onAuthenticated }: Props) {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [consented, setConsented] = useState(hasConsented);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authed) return <>{children}</>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fplLogin(email.trim(), password);
      setAuthed(true);
      onAuthenticated();
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : null;
      if (status === 401) {
        setError("Incorrect email or password.");
      } else if (status === 429) {
        setError("Too many sign-in attempts — wait a minute and try again.");
      } else {
        setError("Could not connect to FPL. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function onConsent(checked: boolean) {
    setConsented(checked);
    if (checked) {
      try {
        localStorage.setItem(CONSENT_KEY, "1");
      } catch {
        // localStorage throws in some private browsing contexts
      }
    }
  }

  return (
    <div className="flex items-start justify-center px-4 pt-16">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <div className="mb-1 text-2xl font-bold tracking-tight">Live Points</div>
          <p className="text-sm leading-snug text-muted-foreground">
            Connect your FPL account to see live scores and your actual team.
          </p>
        </div>

        {!consented && (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">How this works</p>
            <p>
              Your email and password are sent over HTTPS to the FPL Helper server, which authenticates with Fantasy
              Premier League on your behalf. Your credentials are never stored — only the resulting session token is
              kept in your browser.{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                Privacy policy
              </a>
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={consented}
                onChange={(e) => onConsent(e.target.checked)}
              />
              <span>I understand</span>
            </label>
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="fpl-email">
              FPL Email
            </label>
            <input
              id="fpl-email"
              className="input py-2"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="fpl-password">
              Password
            </label>
            <input
              id="fpl-password"
              className="input py-2"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button className="btn btn-primary mt-1 w-full py-2" type="submit" disabled={loading || !consented}>
            {loading ? "Connecting…" : "Connect FPL Account"}
          </button>

          {!consented && <p className="text-center text-xs text-muted-foreground">Check the box above to continue.</p>}
        </form>
      </Card>
    </div>
  );
}
