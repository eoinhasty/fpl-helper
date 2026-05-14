import Card from "../ui/Card";
import type { Player } from "../../lib/types";

export default function HealthCard({ players }: { players?: Player[] | null }) {
  if (!players || players.length === 0) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground mb-2">Team Health</div>
        <div className="text-sm text-muted-foreground">No squad yet.</div>
      </Card>
    );
  }

  const flagged = players.filter(
    (p) =>
      (p.status && p.status !== "a") ||
      (p.start_probability ?? 0) < 0.6 ||
      (p.news || "").toLowerCase().match(/injur|doubt|knock|hamstring|illness|setback/)
  );

  const lowStart = players
    .filter((p) => (p.start_probability ?? 0) < 0.6)
    .sort((a, b) => (a.start_probability ?? 0) - (b.start_probability ?? 0))
    .slice(0, 4);

  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-foreground mb-2">Team Health</div>
      <div className="text-sm text-foreground mb-3">
        <span className="font-semibold">{flagged.length}</span>
        <span className="text-muted-foreground"> at risk • under 60% start or flagged</span>
      </div>
      {lowStart.length > 0 && (
        <ul className="space-y-1">
          {lowStart.map((p) => (
            <li
              key={p.element}
              className="text-sm flex items-center justify-between rounded-md border border-border bg-card px-2 py-1"
            >
              <span className="truncate text-foreground">
                {p.name}{" "}
                <span className="text-xs text-muted-foreground">({p.team})</span>
              </span>
              <span className="text-xs text-destructive font-medium">
                {Math.round((p.start_probability ?? 0) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
