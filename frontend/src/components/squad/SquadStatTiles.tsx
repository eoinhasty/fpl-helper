// components/squad/SquadStatTiles.tsx
import { money } from "../../lib/format";

/** Same tile idiom as LeaguesCard's Tile helper — border, small muted label,
 * bold value — just reused here for Value/Bank/active-chip on mobile, where
 * these used to be crammed into the sticky SquadStatusBar row. */
function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground truncate">{value}</div>
    </div>
  );
}

export default function SquadStatTiles({
  teamValue,
  teamBank,
  activeChip,
}: {
  teamValue?: number | null;
  teamBank?: number | null;
  activeChip?: string | null;
}) {
  return (
    <div className={`grid gap-2 ${activeChip ? "grid-cols-3" : "grid-cols-2"}`}>
      <Tile label="Value" value={money(teamValue)} />
      <Tile label="Bank" value={money(teamBank)} />
      {activeChip && (
        <Tile label="Chip" value={<span className="uppercase">{activeChip.replace(/_/g, " ")}</span>} />
      )}
    </div>
  );
}
