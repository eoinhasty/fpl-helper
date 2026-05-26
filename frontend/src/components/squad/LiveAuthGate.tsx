import React, { useState } from "react";
import Card from "../ui/Card";
import { fplLogin, isAuthenticated } from "../../lib/api";

type Props = {
  children: React.ReactNode;
  onAuthenticated: () => void;
};

export default function LiveAuthGate({ children, onAuthenticated }: Props) {
  const [authed, setAuthed] = useState(isAuthenticated);

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
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.startsWith("401")) {
        setError("Incorrect email or password.");
      } else {
        setError("Could not connect to FPL. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-start justify-center pt-16 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <div className="text-2xl font-bold tracking-tight mb-1">Live Points</div>
          <p className="text-sm text-muted-foreground leading-snug">
            Connect your FPL account to see live scores and your actual team.
            Your credentials are only used to authenticate with FPL and are never stored.
          </p>
        </div>

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
            disabled={loading}
          >
            {loading ? "Connecting…" : "Connect FPL Account"}
          </button>
        </form>
      </Card>
    </div>
  );
}
