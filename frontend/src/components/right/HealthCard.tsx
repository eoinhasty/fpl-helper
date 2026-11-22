import DataCard from "../ui/DataCard";
import { Skeleton } from "../ui/Skeleton";
import type { Player } from "../../lib/types";
import PlayerOpen from "../squad/PlayerOpen";
import { TONE_CLASS, startProbTone, statusTone, statusToText } from "../../lib/utils";

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

  // One rule for the count and the list: flagged by FPL, or short of a
  // likely start by startProbTone's own threshold. A missing start chance
  // isn't treated as 0% — that's no evidence of risk.
  const atRisk = (players ?? [])
    .filter(
      (p) =>
        statusTone(p.status) !== "success" ||
        (p.start_probability != null && startProbTone(p.start_probability) !== "success"),
    )
    .sort((a, b) => (a.start_probability ?? 1) - (b.start_probability ?? 1));
  const shown = atRisk.slice(0, 4);

  return (
    <DataCard
      title="Team Health"
      loading={!unavailable && loading && !players}
      loadingContent={
        <div className="mt-1 space-y-2">
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
      <div className="mb-3 text-sm text-foreground">
        <span className="font-semibold">{atRisk.length}</span>
        <span className="text-muted-foreground"> at risk • flagged or under 70% to start</span>
      </div>
      {shown.length > 0 && (
        <ul className="space-y-1">
          {shown.map((p) => (
            <li key={p.element}>
              <PlayerOpen
                id={p.element}
                className="flex w-full items-center justify-between rounded-md border border-border bg-card px-2 py-1 text-sm"
              >
                <span className="truncate text-foreground">
                  {p.name} <span className="text-xs text-muted-foreground">({p.team})</span>
                </span>
                {p.start_probability != null ? (
                  <span className={`text-xs font-medium ${TONE_CLASS[startProbTone(p.start_probability)].text}`}>
                    {Math.round(p.start_probability * 100)}%
                  </span>
                ) : (
                  <span className={`text-xs font-medium ${TONE_CLASS[statusTone(p.status)].text}`}>
                    {statusToText(p.status)}
                  </span>
                )}
              </PlayerOpen>
            </li>
          ))}
          {atRisk.length > shown.length && (
            <li className="px-2 text-xs text-muted-foreground">+{atRisk.length - shown.length} more</li>
          )}
        </ul>
      )}
    </DataCard>
  );
}
