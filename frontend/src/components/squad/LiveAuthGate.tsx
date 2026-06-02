import React, { useState } from "react";
import Card from "../ui/Card";
import { fplLogin, isAuthenticated } from "../../lib/api";

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
      const msg: string = (err as Error)?.message ?? "";
      if (msg.startsWith("401")) {
        setError("Incorrect email or password.");
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
    <div className="flex items-start justify-center pt-16 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <div className="text-2xl font-bold tracking-tight mb-1">Live Points</div>
          <p className="text-sm text-muted-foreground leading-snug">
            Connect your FPL account to see live scores and your actual team.
          </p>
        </div>

        {!consented && (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground mb-1">How this works</p>
            <p>
              Your email and password are sent over HTTPS to the FPL Helper server,
              which authenticates with Fantasy Premier League on your behalf. Your
              credentials are never stored — only the resulting session token is kept
              in your browser.{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                Privacy policy
              </a>
            </p>
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
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
            <label className="block text-sm font-medium mb-1" htmlFor="fpl-email">
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
            <label className="block text-sm font-medium mb-1" htmlFor="fpl-password">
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

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            className="btn btn-primary w-full py-2 mt-1"
            type="submit"
            disabled={loading || !consented}
          >
            {loading ? "Connecting…" : "Connect FPL Account"}
          </button>

          {!consented && (
            <p className="text-xs text-center text-muted-foreground">
              Check the box above to continue.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
