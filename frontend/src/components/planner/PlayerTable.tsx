// components/planner/PlayerTable.tsx
import * as React from "react";
import type { PoolPlayer, PoolPosition, PoolTeam } from "../../lib/types";
import { fmtPrice } from "../../lib/format";
import { fdrClass, statusToText, TONE_CLASS, statusTone } from "../../lib/utils";
import { Segmented } from "../controls/Segmented";
import { SelectMenu } from "../controls/SelectMenu";
import XgiBadge from "../squad/XgiBadge";

/** Badge styling for a non-available status; null when available. */
function statusBadgeClass(s: string | undefined): string | null {
  if (!s || s === "a") return null;
  const t = TONE_CLASS[statusTone(s)];
  return `${t.soft} ${t.text}`;
}

type SortKey = "now_cost" | "selected_by_percent" | "xpts1" | "xpts3" | "xpts5" | "form";

/** GWs summed by each xPts sort */
const XPTS_GWS: Partial<Record<SortKey, number>> = { xpts1: 1, xpts3: 3, xpts5: 5 };

/** The points model's projection over the next `n` GWs (the first scaled by
 * chance of playing, as on the squad view), or FPL's ep_next for one GW when
 * no projections are published. */
function xpts(p: PoolPlayer, n: number, model: boolean): number | null {
  if (model) return (p.projected_gws ?? []).slice(0, n).reduce((a, b) => a + b, 0);
  return n === 1 && p.ep_next != null ? num(p.ep_next) : null;
}

function gwRange(gw: number | null | undefined, n: number): string {
  if (!gw) return n === 1 ? "next" : `${n} GW`;
  return n === 1 ? `GW${gw}` : `GW${gw}–${gw + n - 1}`;
}

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
  gw,
  canAdd,
  onAdd,
  onSelect,
}: {
  players: PoolPlayer[];
  teams: PoolTeam[];
  /** GW the projections start from (PlayersResponse.gw) */
  gw?: number | null;
  canAdd: (p: PoolPlayer) => { ok: boolean; reason?: string; warning?: string };
  onAdd: (p: PoolPlayer) => void;
  onSelect?: (p: PoolPlayer) => void;
}) {
  const [position, setPosition] = React.useState<PoolPosition | "ALL">("ALL");
  const [teamId, setTeamId] = React.useState<string>("ALL");
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("now_cost");
  // Whether the points model's projections are published: without them only
  // FPL's one-GW ep_next is available, so the multi-GW sorts go
  const model = React.useMemo(() => players.some((p) => p.projected_gws != null), [players]);
  // The xPts column follows the last xPts sort chosen (one GW until then)
  const [xptsGws, setXptsGws] = React.useState(1);
  const shownGws = model ? xptsGws : 1;
  const sortOptions: { label: string; value: SortKey }[] = [
    { label: "Price", value: "now_cost" },
    { label: "Ownership", value: "selected_by_percent" },
    { label: `xPts ${gwRange(gw, 1)}`, value: "xpts1" },
    ...(model
      ? [
          { label: `xPts ${gwRange(gw, 3)}`, value: "xpts3" as const },
          { label: `xPts ${gwRange(gw, 5)}`, value: "xpts5" as const },
        ]
      : []),
    { label: "Form", value: "form" },
  ];
  const changeSort = (key: SortKey) => {
    setSortKey(key);
    if (XPTS_GWS[key]) setXptsGws(XPTS_GWS[key]);
  };
  const [sortDesc, setSortDesc] = React.useState(true);
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = players;
    if (position !== "ALL") rows = rows.filter((p) => p.position === position);
    if (teamId !== "ALL") rows = rows.filter((p) => String(p.team) === teamId);
    if (q) {
      rows = rows.filter((p) => p.web_name.toLowerCase().includes(q) || (p.full_name ?? "").toLowerCase().includes(q));
    }
    const value = (p: PoolPlayer): number => {
      const n = XPTS_GWS[sortKey];
      if (n) return xpts(p, n, model) ?? 0;
      if (sortKey === "now_cost") return p.now_cost ?? 0;
      return num(p[sortKey as "selected_by_percent" | "form"]);
    };
    const sorted = [...rows].sort((a, b) => (sortDesc ? value(b) - value(a) : value(a) - value(b)));
    return sorted;
  }, [players, position, teamId, query, sortKey, sortDesc, model]);

  React.useEffect(() => setVisible(PAGE_SIZE), [position, teamId, query, sortKey, sortDesc]);

  const rows = filtered.slice(0, visible);

  const filtersActive = position !== "ALL" || teamId !== "ALL" || query !== "";
  const clearFilters = () => {
    setPosition("ALL");
    setTeamId("ALL");
    setQuery("");
  };
  const clearFiltersButton = (
    <button
      type="button"
      onClick={clearFilters}
      className="-my-3.5 cursor-pointer py-3.5 font-medium text-primary-strong hover:underline"
    >
      Clear filters
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl bg-card px-1 py-2 shadow-sm">
        <Segmented<PoolPosition | "ALL"> value={position} onChange={setPosition} options={POSITION_OPTIONS} />
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
          className="h-10 min-w-40 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
          aria-label="Search players"
        />
        <SelectMenu
          value={sortKey}
          onChange={changeSort}
          ariaLabel="Sort by"
          className="w-52"
          options={sortOptions.map((o) => ({ label: `Sort: ${o.label}`, value: o.value }))}
        />
        <button
          type="button"
          onClick={() => setSortDesc((v) => !v)}
          className="h-10 cursor-pointer rounded-xl border border-border bg-card px-3 text-sm text-foreground transition hover:bg-muted/60"
          title="Toggle sort direction"
        >
          {sortDesc ? "↓" : "↑"}
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{filtered.length} players</span>
        {filtersActive && rows.length > 0 && clearFiltersButton}
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((p) => {
          const { ok, reason, warning } = canAdd(p);
          const alreadyAdded = reason === "Already in squad";
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                alreadyAdded ? "border-primary/30 bg-primary/5" : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect?.(p)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left transition hover:opacity-80"
              >
                {p.shirt_url ? (
                  <img src={p.shirt_url} alt="" className="h-8 w-8 shrink-0 object-contain" loading="lazy" />
                ) : (
                  <div className="h-8 w-8 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">{p.web_name}</span>
                    <span className="text-xs text-muted-foreground">{p.team_short}</span>
                    <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {p.position}
                    </span>
                    {statusBadgeClass(p.status) && (
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] ${statusBadgeClass(p.status)}`}
                        title={p.news || statusToText(p.status)}
                      >
                        {statusToText(p.status)}
                      </span>
                    )}
                    {(p.penalties_order ?? 99) <= 2 && (
                      <span
                        className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                        title="Penalty taker"
                      >
                        PK{p.penalties_order}
                      </span>
                    )}
                    {(p.corners_order ?? 99) <= 2 && (
                      <span
                        className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title="Corners taker"
                      >
                        CK{p.corners_order}
                      </span>
                    )}
                    {(p.freekicks_order ?? 99) <= 2 && (
                      <span
                        className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title="Free-kick taker"
                      >
                        FK{p.freekicks_order}
                      </span>
                    )}
                    <XgiBadge
                      signal={p.xgi_signal}
                      ga={(p.goals_scored ?? 0) + (p.assists ?? 0)}
                      xgi={p.expected_goal_involvements}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {(p.fixtures ?? []).slice(0, 3).map((f, i) => (
                      <span key={i} className={`rounded-full px-1.5 py-0.5 text-[10px] ${fdrClass(f.difficulty)}`}>
                        {f.home ? "v" : "@"}
                        {f.opp}
                      </span>
                    ))}
                  </div>
                </div>
              </button>

              <div className="w-16 shrink-0 text-right">
                <div className="text-sm font-semibold text-foreground tabular-nums">{fmtPrice(p.now_cost)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {p.selected_by_percent != null ? `${p.selected_by_percent}%` : "—"}
                </div>
              </div>
              <div className="w-14 shrink-0 text-right" title={`Projected points, ${gwRange(gw, shownGws)}`}>
                <div className="text-sm font-semibold text-primary-strong tabular-nums">
                  {xpts(p, shownGws, model)?.toFixed(1) ?? "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {shownGws === 1 ? "xPts" : `xPts ${shownGws}GW`}
                </div>
              </div>

              <button
                type="button"
                onClick={() => ok && onAdd(p)}
                disabled={!ok}
                title={!ok ? reason : warning}
                aria-label={warning ? `Add ${p.web_name} (${warning})` : undefined}
                className={`h-10 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${
                  ok && warning
                    ? `border ${TONE_CLASS.warning.soft} cursor-pointer text-foreground hover:opacity-90`
                    : ok
                      ? "cursor-pointer bg-primary text-primary-foreground hover:opacity-90"
                      : alreadyAdded
                        ? "cursor-default bg-primary/15 text-primary"
                        : "cursor-not-allowed bg-muted text-muted-foreground/50"
                }`}
              >
                {alreadyAdded ? "✓ Added" : warning ? "Add ⚠" : "Add"}
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="space-y-2 py-8 text-center text-sm text-muted-foreground">
            <div>No players match these filters.</div>
            {filtersActive && <div>{clearFiltersButton}</div>}
          </div>
        )}
      </div>

      {visible < filtered.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="h-9 w-full cursor-pointer rounded-xl border border-border bg-card text-sm text-foreground transition hover:bg-muted/60"
        >
          Show more ({filtered.length - visible} remaining)
        </button>
      )}
    </div>
  );
}
