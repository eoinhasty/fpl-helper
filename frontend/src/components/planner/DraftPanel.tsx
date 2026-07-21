// components/planner/DraftPanel.tsx
import type { PoolPlayer, PoolPosition } from "../../lib/types";
import { fmtPrice } from "../../lib/format";
import { BUDGET, MAX_PER_CLUB, QUOTAS } from "../../hooks/useDraft";

const POSITION_ORDER: PoolPosition[] = ["GK", "DEF", "MID", "FWD"];

export default function DraftPanel({
  picks,
  budget,
  clubCounts,
  violations,
  onRemove,
  onSelect,
  onClear,
}: {
  picks: PoolPlayer[];
  budget: { spent: number; bank: number };
  clubCounts: Map<number, number>;
  violations: string[];
  onRemove: (id: number) => void;
  onSelect?: (p: PoolPlayer) => void;
  onClear: () => void;
}) {
  const hasViolations = violations.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground/80">Budget</span>
          <span className={`text-xs font-semibold tabular-nums ${hasViolations ? "text-destructive" : "text-foreground"}`}>
            {fmtPrice(budget.spent)} / £{(BUDGET / 10).toFixed(1)}m
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${budget.bank < 0 ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${Math.min(100, (budget.spent / BUDGET) * 100)}%` }}
          />
        </div>
        <div className={`text-xs mt-1 tabular-nums ${budget.bank < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          Bank: £{(budget.bank / 10).toFixed(1)}m
        </div>
      </div>

      {hasViolations && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 space-y-1">
          {violations.map((v) => (
            <div key={v} className="text-xs text-destructive">{v}</div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground/80">
          Squad ({picks.length}/15)
        </span>
        {picks.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Clear your entire draft? This can't be undone.")) onClear();
            }}
            className="text-xs text-muted-foreground hover:text-destructive cursor-pointer transition"
          >
            Clear draft
          </button>
        )}
      </div>

      <div className="space-y-3">
        {POSITION_ORDER.map((pos) => {
          const slots = QUOTAS[pos];
          const posPicks = picks.filter((p) => p.position === pos);
          return (
            <div key={pos}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {pos} ({posPicks.length}/{slots})
              </div>
              <div className="flex flex-col gap-1.5">
                {posPicks.map((p) => {
                  const clubOverLimit = (clubCounts.get(p.team) ?? 0) > MAX_PER_CLUB;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 border rounded-lg px-2.5 py-1.5 bg-card ${
                        clubOverLimit ? "border-destructive/40" : "border-border"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect?.(p)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2 cursor-pointer transition hover:opacity-80"
                      >
                        <span className="text-sm text-foreground truncate">{p.web_name}</span>
                        <span
                          className={`text-[10px] ${clubOverLimit ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                        >
                          {p.team_short}
                        </span>
                      </button>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmtPrice(p.now_cost)}</span>
                      <button
                        type="button"
                        onClick={() => onRemove(p.id)}
                        className="shrink-0 text-xs text-muted-foreground hover:text-destructive px-1.5 cursor-pointer transition"
                        aria-label={`Remove ${p.web_name}`}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                {Array.from({ length: Math.max(0, slots - posPicks.length) }).map((_, i) => (
                  <div
                    key={`empty-${pos}-${i}`}
                    className="border border-dashed border-border rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/60"
                  >
                    Empty slot
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
