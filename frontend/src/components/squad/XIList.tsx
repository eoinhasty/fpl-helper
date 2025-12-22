import { useMemo } from "react";
import type { Player } from "../../lib/types";
import PlayerCard from "./PlayerCard";
import Card from "../ui/Card";

function benchLabel(p: Player) {
  if ((p.slot ?? 0) === 12 || p.position === 1) return "GK";
  const n = (p.slot ?? 0) - 11;
  if (n >= 2 && n <= 4) return `B${n - 1}`;
  return null;
}

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
    () =>
      (players || [])
        .filter((p) => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11)
        .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)),
    [players]
  );

  const bench = useMemo(
    () =>
      (players || [])
        .filter((p) => !((p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11))
        .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)),
    [players]
  );

  return (
    <Card className="p-3 space-y-2">
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
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
            <PlayerCard key={p.element} p={p} benchBadge={benchLabel(p)} onOpen={() => onPlayerClick?.(p)} />
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
