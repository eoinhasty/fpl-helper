// components/planner/DraftPanel.tsx
import type { PoolPlayer, PoolPosition } from "../../lib/types";
import { fmtPrice } from "../../lib/format";
import { TONE_CLASS } from "../../lib/utils";
import { BUDGET, MAX_PER_CLUB, QUOTAS } from "../../hooks/useDraft";

const POSITION_ORDER: PoolPosition[] = ["GK", "DEF", "MID", "FWD"];

export default function DraftPanel({
  picks,
  budget,
  clubCounts,
  violations,
  warnings,
  onRemove,
  onSelect,
  onClear,
}: {
  picks: PoolPlayer[];
  budget: { spent: number; bank: number };
  clubCounts: Map<number, number>;
  violations: string[];
  warnings: string[];
  onRemove: (code: number) => void;
  onSelect?: (p: PoolPlayer) => void;
  onClear: () => void;
}) {
  const hasViolations = violations.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground/80">Budget</span>
          <span
            className={`text-xs font-semibold tabular-nums ${hasViolations ? "text-destructive" : "text-foreground"}`}
          >
            {fmtPrice(budget.spent)} / £{(BUDGET / 10).toFixed(1)}m
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${budget.bank < 0 ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${Math.min(100, (budget.spent / BUDGET) * 100)}%` }}
          />
        </div>
        <div
          className={`mt-1 text-xs tabular-nums ${budget.bank < 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}
        >
          Bank: £{(budget.bank / 10).toFixed(1)}m
        </div>
      </div>

      {hasViolations && (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2">
          {violations.map((v) => (
            <div key={v} className="text-xs text-destructive">
              {v}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className={`space-y-1 rounded-lg border px-3 py-2 ${TONE_CLASS.warning.soft}`}>
          {warnings.map((w) => (
            <div key={w} className="text-xs text-foreground">
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground/80">Squad ({picks.length}/15)</span>
        {picks.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Clear your entire draft? This can't be undone.")) onClear();
            }}
            className="-mx-2 -my-1.5 cursor-pointer rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-destructive/5 hover:text-destructive"
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
              <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {pos} ({posPicks.length}/{slots})
              </div>
              <div className="flex flex-col gap-1.5">
                {posPicks.map((p) => {
                  const clubOverLimit = (clubCounts.get(p.team) ?? 0) > MAX_PER_CLUB;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 ${
                        clubOverLimit ? "border-destructive/40" : "border-border"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect?.(p)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left transition hover:opacity-80"
                      >
                        <span className="truncate text-sm text-foreground">{p.web_name}</span>
                        <span
                          className={`text-[10px] ${clubOverLimit ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                        >
                          {p.team_short}
                        </span>
                      </button>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {fmtPrice(p.now_cost)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(p.code)}
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
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
                    className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground/60"
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
