import DataCard from "../ui/DataCard";
import type { Player } from "../../lib/types";
import { lineupValue, suggestLineup } from "../../lib/lineup";

function PlayerLine({
  p,
  projected,
  onPlayerClick,
}: {
  p: Player;
  projected: boolean;
  onPlayerClick?: (p: Player) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPlayerClick?.(p)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-foreground">
          {p.name} <span className="text-[11px] text-muted-foreground">{p.team}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {lineupValue(p).toFixed(1)} {projected ? "proj" : "xPts"}
        </span>
      </button>
    </li>
  );
}

export default function BestXiCard({
  entry,
  players,
  loading,
  error,
  isHistorical,
  onPlayerClick,
}: {
  entry?: number | "";
  players?: Player[] | null;
  loading?: boolean;
  error?: string | null;
  isHistorical?: boolean;
  onPlayerClick?: (p: Player) => void;
}) {
  const s = players && !isHistorical ? suggestLineup(players) : null;
  const emptyMessage = isHistorical
    ? "Lineup suggestions use live data — not available for past GWs."
    : !entry
      ? "Set your entry id to see lineup suggestions."
      : "Lineup suggestions appear once your full squad is loaded.";
  const unit = s?.projected ? "proj pts" : "xPts";

  return (
    <DataCard
      title="Best XI"
      loading={loading && !players}
      error={error}
      empty={!s}
      emptyMessage={emptyMessage}
      right={
        s && s.gain > 0 ? (
          <span className="text-xs font-semibold text-success">
            +{s.gain.toFixed(1)} {unit}
          </span>
        ) : undefined
      }
    >
      {s && (
        <div className="space-y-3">
          {s.bringIn.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Your starting XI is already the best on {s.projected ? "projected points" : "FPL's xPts"}.
            </div>
          ) : (
            <>
              {s.formation !== s.currentFormation && (
                <div className="text-xs text-muted-foreground">
                  Formation {s.currentFormation} → <span className="font-semibold text-foreground">{s.formation}</span>
                </div>
              )}
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Start</div>
                <ul>
                  {s.bringIn.map((p) => (
                    <PlayerLine key={p.element} p={p} projected={s.projected} onPlayerClick={onPlayerClick} />
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Bench</div>
                <ul>
                  {s.drop.map((p) => (
                    <PlayerLine key={p.element} p={p} projected={s.projected} onPlayerClick={onPlayerClick} />
                  ))}
                </ul>
              </div>
            </>
          )}
          {s.benchChanged && (
            <div className="border-t border-border pt-2 text-xs text-muted-foreground">
              Bench order:{" "}
              <span className="text-foreground">{s.bench.map((p) => p.name).join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </DataCard>
  );
}
