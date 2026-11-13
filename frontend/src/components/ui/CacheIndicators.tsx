import { useAgeTicker } from "../../hooks/useAgeTicker";
import type { CacheStatus } from "../../lib/api";

type Props = {
  status: CacheStatus;
  ageSeconds: number | null;
  isSwitching?: boolean;
};

export default function CacheIndicators({ status, ageSeconds, isSwitching }: Props) {
  const liveAge = useAgeTicker(ageSeconds);

  // Suppress during a mode switch — cache meta briefly still belongs to the
  // mode just left, so a leftover 'stale-serve' shouldn't badge the new mode.
  const isRefreshing = status === "stale-serve" && !isSwitching;
  const label =
    liveAge == null
      ? "Updated just now"
      : liveAge < 60
        ? `Updated ${Math.floor(liveAge)}s ago`
        : `Updated ${Math.floor(liveAge / 60)}m ago`;

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      {/* Age label */}
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-success" />
        {label}
      </span>

      {/* Refreshing badge (when server served stale + is revalidating) */}
      {isRefreshing && (
        <span className="inline-flex items-center gap-2 rounded-full bg-warning/20 px-2 py-0.5 text-warning">
          <Spinner className="h-3 w-3" />
          Refreshing…
        </span>
      )}

      {/* Optional: exact cache status for debugging */}
      {/* <code className="text-xs text-muted-foreground/60">[{status ?? 'no-cache-meta'}]</code> */}
    </div>
  );
}

function Spinner({ className = "" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" role="img" aria-label="loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" fill="none" />
    </svg>
  );
}
