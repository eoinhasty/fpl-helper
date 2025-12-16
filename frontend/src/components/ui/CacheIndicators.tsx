import { useAgeTicker } from '../../hooks/useAgeTicker';
import type { CacheStatus } from '../../lib/api';

type Props = {
  status: CacheStatus;
  ageSeconds: number | null;
};

export default function CacheIndicators({ status, ageSeconds }: Props) {
  const liveAge = useAgeTicker(ageSeconds);

  const isRefreshing = status === 'stale-serve';
  const label =
    liveAge == null ? 'Updated just now' :
    liveAge < 60     ? `Updated ${liveAge}s ago` :
    `Updated ${Math.floor(liveAge / 60)}m ago`;

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      {/* Age label */}
      <span className="inline-flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-success" />
        {label}
      </span>

      {/* Refreshing badge (when server served stale + is revalidating) */}
      {isRefreshing && (
        <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-warning/20 text-warning">
          <Spinner className="w-3 h-3" />
          Refreshing…
        </span>
      )}

      {/* Optional: exact cache status for debugging */}
      {/* <code className="text-xs text-muted-foreground/60">[{status ?? 'no-cache-meta'}]</code> */}
    </div>
  );
}

function Spinner({ className = '' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label="loading"
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
    </svg>
  );
}