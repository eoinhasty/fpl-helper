import { useMemo } from "react";
import type { Player } from "../../lib/types";
import { isStarting } from "../../lib/utils";
import { BENCH_LABEL } from "../../lib/constants";
import PlayerCard from "./PlayerCard";
import Card from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";


export default function XIList({
  players,
  loading,
  error,
  entryMissing,
  onPlayerClick,
}: {
  players: Player[] | undefined;
  loading: boolean;
  error: string | null;
  entryMissing: boolean;
  onPlayerClick?: (p: Player) => void;
}) {
  const xi = useMemo(
    () => (players || []).filter(isStarting).sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)),
    [players]
  );

  const bench = useMemo(
    () => (players || []).filter((p) => !isStarting(p)).sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)),
    [players]
  );

  if (loading && !players) {
    return (
      <Card className="p-3 space-y-2">
        {[...Array(11)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-xl border border-border">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <Skeleton className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-3 space-y-2">
      {error && <div className="text-sm text-destructive">{error}</div>}

      {xi.length > 0 && (
        <div className="text-sm text-foreground font-semibold mb-2">Starting XI</div>
      )}
      {xi.map((p) => (
        <PlayerCard key={p.element} p={p} onOpen={() => onPlayerClick?.(p)} />
      ))}

      {bench.length > 0 && (
        <>
          <div className="text-sm text-foreground font-semibold mt-4 mb-2">Bench</div>
          {bench.map((p) => (
            <PlayerCard key={p.element} p={p} benchBadge={BENCH_LABEL[p.slot ?? 0] ?? null} onOpen={() => onPlayerClick?.(p)} />
          ))}
        </>
      )}

      {entryMissing && (
        <div className="text-sm text-muted-foreground">
          Set your entry id (saved as <code>fpl-entry</code>) to auto-load here.
        </div>
      )}
    </Card>
  );
}
