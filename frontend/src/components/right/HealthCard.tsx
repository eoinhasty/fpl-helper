import DataCard from "../ui/DataCard";
import { Skeleton } from "../ui/Skeleton";
import type { Player } from "../../lib/types";
import PlayerOpen from "../squad/PlayerOpen";

export default function HealthCard({
  entry,
  players,
  loading,
  error,
  isHistorical,
}: {
  entry?: number | "";
  players?: Player[] | null;
  loading?: boolean;
  error?: string | null;
  isHistorical?: boolean;
}) {
  // Statuses and news are today's, so against a past GW's squad they'd
  // flag players who were fine then (as CaptaincyCard does)
  const unavailable = isHistorical
    ? "Team health uses today's injury news — not available for past GWs."
    : !entry
      ? "Set your entry id to see team health."
      : null;

  const flagged = (players ?? []).filter(
    (p) =>
      (p.status && p.status !== "a") ||
      (p.start_probability ?? 0) < 0.6 ||
      (p.news || "").toLowerCase().match(/injur|doubt|knock|hamstring|illness|setback/)
  );

  const lowStart = (players ?? [])
    .filter((p) => (p.start_probability ?? 0) < 0.6)
    .sort((a, b) => (a.start_probability ?? 0) - (b.start_probability ?? 0))
    .slice(0, 4);

  return (
    <DataCard
      title="Team Health"
      loading={!unavailable && loading && !players}
      loadingContent={
        <div className="space-y-2 mt-1">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      }
      error={unavailable ? null : error}
      empty={!!unavailable || !players || players.length === 0}
      emptyMessage={unavailable ?? "Team health appears once your squad is loaded."}
    >
      <div className="text-sm text-foreground mb-3">
        <span className="font-semibold">{flagged.length}</span>
        <span className="text-muted-foreground"> at risk • under 60% start or flagged</span>
      </div>
      {lowStart.length > 0 && (
        <ul className="space-y-1">
          {lowStart.map((p) => (
            <li key={p.element}>
              <PlayerOpen
                id={p.element}
                className="w-full text-sm flex items-center justify-between rounded-md border border-border bg-card px-2 py-1"
              >
              <span className="truncate text-foreground">
                {p.name}{" "}
                <span className="text-xs text-muted-foreground">({p.team})</span>
              </span>
              <span className="text-xs text-destructive font-medium">
                {Math.round((p.start_probability ?? 0) * 100)}%
              </span>
              </PlayerOpen>
            </li>
          ))}
        </ul>
      )}
    </DataCard>
  );
}
