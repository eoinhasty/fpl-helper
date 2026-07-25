// components/planner/PlayerTable.tsx
import * as React from "react";
import type { PoolPlayer, PoolPosition, PoolTeam } from "../../lib/types";
import { fmtPrice } from "../../lib/format";
import { fdrClass, statusToText } from "../../lib/utils";
import { Segmented } from "../controls/Segmented";
import { SelectMenu } from "../controls/SelectMenu";

/** Semantic-token badge styling for a player's status — mirrors the cfg object
 * in PlayerDetailModal's StatusBanner (dark-mode safe), not the unused/dead
 * `statusClass` helper in lib/utils.ts (hardcoded hex, doesn't adapt to dark mode). */
function statusBadgeClass(s: string | undefined): string | null {
  if (!s || s === "a") return null;
  if (s === "d") return "bg-warning/10 text-warning border-warning/30";
  if (s === "i" || s === "s") return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-muted/60 text-muted-foreground border-border";
}

type SortKey = "now_cost" | "selected_by_percent" | "ep_next" | "form";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Price", value: "now_cost" },
  { label: "Ownership", value: "selected_by_percent" },
  { label: "xPts next", value: "ep_next" },
  { label: "Form", value: "form" },
];

const POSITION_OPTIONS: { label: string; value: PoolPosition | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "GK", value: "GK" },
  { label: "DEF", value: "DEF" },
  { label: "MID", value: "MID" },
  { label: "FWD", value: "FWD" },
];

const PAGE_SIZE = 100;

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function PlayerTable({
  players,
  teams,
  canAdd,
  onAdd,
  onSelect,
}: {
  players: PoolPlayer[];
  teams: PoolTeam[];
  canAdd: (p: PoolPlayer) => { ok: boolean; reason?: string };
  onAdd: (p: PoolPlayer) => void;
  onSelect?: (p: PoolPlayer) => void;
}) {
  const [position, setPosition] = React.useState<PoolPosition | "ALL">("ALL");
  const [teamId, setTeamId] = React.useState<string>("ALL");
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("now_cost");
  const [sortDesc, setSortDesc] = React.useState(true);
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = players;
    if (position !== "ALL") rows = rows.filter((p) => p.position === position);
    if (teamId !== "ALL") rows = rows.filter((p) => String(p.team) === teamId);
    if (q) {
      rows = rows.filter(
        (p) =>
          p.web_name.toLowerCase().includes(q) ||
          (p.full_name ?? "").toLowerCase().includes(q)
      );
    }
    const sorted = [...rows].sort((a, b) => {
      const av = sortKey === "now_cost" ? a.now_cost ?? 0 : num(a[sortKey] as string | undefined);
      const bv = sortKey === "now_cost" ? b.now_cost ?? 0 : num(b[sortKey] as string | undefined);
      return sortDesc ? bv - av : av - bv;
    });
    return sorted;
  }, [players, position, teamId, query, sortKey, sortDesc]);

  React.useEffect(() => setVisible(PAGE_SIZE), [position, teamId, query, sortKey, sortDesc]);

  const rows = filtered.slice(0, visible);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-card py-2 -mx-1 px-1 rounded-xl shadow-sm">
        <Segmented<PoolPosition | "ALL">
          value={position}
          onChange={setPosition}
          options={POSITION_OPTIONS}
        />
        <SelectMenu
          value={teamId}
          onChange={setTeamId}
          ariaLabel="Filter by team"
          className="w-32"
          options={[
            { label: "All teams", value: "ALL" },
            ...teams.map((t) => ({ label: t.short_name, value: String(t.id) })),
          ]}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player…"
          className="h-9 px-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground flex-1 min-w-[160px]"
          aria-label="Search players"
        />
        <SelectMenu
          value={sortKey}
          onChange={setSortKey}
          ariaLabel="Sort by"
          className="w-40"
          options={SORT_OPTIONS.map((o) => ({ label: `Sort: ${o.label}`, value: o.value }))}
        />
        <button
          type="button"
          onClick={() => setSortDesc((v) => !v)}
          className="h-9 px-3 rounded-xl border border-border bg-card text-sm text-foreground cursor-pointer transition hover:bg-muted/60"
          title="Toggle sort direction"
        >
          {sortDesc ? "↓" : "↑"}
        </button>
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} players</div>

      <div className="flex flex-col gap-2">
        {rows.map((p) => {
          const { ok, reason } = canAdd(p);
          const alreadyAdded = reason === "Already in squad";
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${
                alreadyAdded ? "border-primary/30 bg-primary/5" : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect?.(p)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer transition hover:opacity-80"
              >
                {p.shirt_url ? (
                  <img src={p.shirt_url} alt="" className="w-8 h-8 object-contain shrink-0" loading="lazy" />
                ) : (
                  <div className="w-8 h-8 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">{p.web_name}</span>
                    <span className="text-xs text-muted-foreground">{p.team_short}</span>
                    <span className="text-[10px] font-semibold text-muted-foreground border border-border/60 rounded-full px-1.5 py-0.5">
                      {p.position}
                    </span>
                    {statusBadgeClass(p.status) && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusBadgeClass(p.status)}`}
                        title={p.news || statusToText(p.status)}
                      >
                        {statusToText(p.status)}
                      </span>
                    )}
                    {(p.penalties_order ?? 99) <= 2 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30" title="Penalty taker">
                        PK{p.penalties_order}
                      </span>
                    )}
                    {(p.corners_order ?? 99) <= 2 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border" title="Corners taker">
                        CK{p.corners_order}
                      </span>
                    )}
                    {(p.freekicks_order ?? 99) <= 2 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border" title="Free-kick taker">
                        FK{p.freekicks_order}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(p.fixtures ?? []).slice(0, 3).map((f, i) => (
                      <span
                        key={i}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${fdrClass(f.difficulty)}`}
                      >
                        {f.home ? "v" : "@"}{f.opp}
                      </span>
                    ))}
                  </div>
                </div>
              </button>

              <div className="text-right shrink-0 w-16">
                <div className="text-sm font-semibold text-foreground tabular-nums">{fmtPrice(p.now_cost)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {p.selected_by_percent != null ? `${p.selected_by_percent}%` : "—"}
                </div>
              </div>
              <div className="text-right shrink-0 w-12">
                <div className="text-sm font-semibold text-primary tabular-nums">
                  {p.ep_next ? Number(p.ep_next).toFixed(1) : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">xPts</div>
              </div>

              <button
                type="button"
                onClick={() => ok && onAdd(p)}
                disabled={!ok}
                title={!ok ? reason : undefined}
                className={`shrink-0 h-8 px-3 rounded-lg text-xs font-semibold transition ${
                  ok
                    ? "bg-primary text-primary-foreground cursor-pointer hover:opacity-90"
                    : alreadyAdded
                      ? "bg-primary/15 text-primary cursor-default"
                      : "bg-muted text-muted-foreground/50 cursor-not-allowed"
                }`}
              >
                {alreadyAdded ? "✓ Added" : "Add"}
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">No players match these filters.</div>
        )}
      </div>

      {visible < filtered.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="w-full h-9 rounded-xl border border-border bg-card text-sm text-foreground cursor-pointer transition hover:bg-muted/60"
        >
          Show more ({filtered.length - visible} remaining)
        </button>
      )}
    </div>
  );
}
