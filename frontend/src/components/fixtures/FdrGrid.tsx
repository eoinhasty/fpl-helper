import * as React from "react";
import type { FdrGridResponse, FdrTeam, FixtureLite } from "../../lib/types";
import { fdrClass, xgBand } from "../../lib/utils";

/** FPL's difficulty rating, or expected goals from the team ratings published
 * with the projections (tools/analysis/team_model.py): scored (attack) or a
 * clean sheet's chance (defence). */
export type TickerView = "fdr" | "attack" | "defence";

type SortKey = "summary" | number;

const FDR_LEVELS = [1, 2, 3, 4, 5] as const;

/** Poisson chance of conceding nothing — the analysis tools' clean_sheet_prob */
const cleanSheet = (xgAgainst: number) => Math.exp(-xgAgainst);

/** The fixture's 1–5 colour band in this view, or undefined when the model doesn't cover it */
function band(f: FixtureLite, view: TickerView, leagueXg: number): number | undefined {
  if (view === "fdr") return f.difficulty;
  if (view === "attack") return f.xg_for == null ? undefined : xgBand(f.xg_for / leagueXg, true);
  return f.xg_against == null ? undefined : xgBand(f.xg_against / leagueXg, false);
}

/** What a view sums per fixture (higher is better); null when not covered */
function fixtureValue(f: FixtureLite, view: Exclude<TickerView, "fdr">): number | null {
  if (view === "attack") return f.xg_for ?? null;
  return f.xg_against == null ? null : cleanSheet(f.xg_against);
}

const VIEW_COPY = {
  fdr: { summary: "Avg", summaryTitle: "Sort by average difficulty across the range shown" },
  attack: { summary: "xG", summaryTitle: "Sort by total expected goals across the range the model covers" },
  defence: { summary: "CS", summaryTitle: "Sort by expected clean sheets across the range the model covers" },
} as const;

function Legend({ view, leagueXg, coveredTo }: { view: TickerView; leagueXg: number; coveredTo: number | null }) {
  return (
    <div className="mb-3 space-y-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Easier</span>
        <div className="flex items-center gap-1">
          {FDR_LEVELS.map((d) => (
            <span
              key={d}
              className={`inline-flex h-5 w-5 items-center justify-center rounded ${fdrClass(d)}`}
              title={view === "fdr" ? `FDR ${d}` : undefined}
            >
              {d}
            </span>
          ))}
        </div>
        <span>Harder</span>
      </div>
      {view !== "fdr" && (
        <p>
          {view === "attack"
            ? `Expected goals scored, rated from both sides' xG this season and over their last 12 matches — an average side scores ${leagueXg.toFixed(2)} a game.`
            : `Chance of a clean sheet, rated from both sides' xG this season and over their last 12 matches — an average side concedes ${leagueXg.toFixed(2)} a game.`}
          {coveredTo != null && ` The model looks ahead to GW${coveredTo}.`}
        </p>
      )}
    </div>
  );
}

/** One heatmap tile: the fixture's colour fills the whole cell, not a pill floating inside it. */
function FixtureTile({ f, view, leagueXg }: { f: FixtureLite; view: TickerView; leagueXg: number }) {
  const venue = `${f.home ? "Home" : "Away"} vs ${f.opp}`;
  let detail: string | null = null;
  let title = `${venue} • FDR ${f.difficulty}`;
  if (view !== "fdr") {
    const value = fixtureValue(f, view);
    if (value == null) {
      title = `${venue} • beyond the model's range`;
    } else if (view === "attack") {
      detail = value.toFixed(1);
      title = `${venue} • ${value.toFixed(2)} expected goals`;
    } else {
      detail = `${Math.round(value * 100)}%`;
      title = `${venue} • ${Math.round(value * 100)}% clean sheet chance (${f.xg_against?.toFixed(2)} xG against)`;
    }
  }
  return (
    <div
      className={`flex min-h-9 flex-1 flex-col items-center justify-center rounded-md text-xs leading-tight font-medium ${fdrClass(band(f, view, leagueXg))}`}
      title={title}
    >
      <span>
        {f.home ? "v" : "@"}
        {f.opp}
      </span>
      {detail && <span className="text-[10px] font-normal tabular-nums opacity-80">{detail}</span>}
    </div>
  );
}

export default function FdrGrid({ data, view = "fdr" }: { data: FdrGridResponse; view?: TickerView }) {
  const [sortKey, setSortKey] = React.useState<SortKey>("summary");
  const leagueXg = data.league_xg ?? 1;
  const modelView = view === "fdr" ? null : view;

  /** Summed model value over the fixtures given (null when none are covered) */
  const total = React.useCallback(
    (fixtures: FixtureLite[]): number | null => {
      if (!modelView) return null;
      const values = fixtures.map((f) => fixtureValue(f, modelView)).filter((v): v is number => v != null);
      return values.length ? values.reduce((a, b) => a + b, 0) : null;
    },
    [modelView],
  );

  const coveredTo = React.useMemo(() => {
    if (!modelView) return null;
    const covered = data.gws.filter((_, i) => data.teams.some((t) => total(t.gws[i] ?? []) != null));
    return covered.length && covered.length < data.gws.length ? covered[covered.length - 1].id : null;
  }, [data, modelView, total]);

  const summary = React.useCallback(
    (t: FdrTeam): number | null => (modelView ? total(t.gws.flat()) : t.avg_difficulty),
    [modelView, total],
  );

  const sortedTeams = React.useMemo(() => {
    // Ascending rank = easiest first: FDR as is, model values (higher is better) negated
    const rank = (t: FdrTeam): number => {
      if (sortKey === "summary") {
        const v = summary(t);
        return v == null ? 99 : modelView ? -v : v;
      }
      const idx = data.gws.findIndex((g) => g.id === sortKey);
      const fixtures = idx >= 0 ? t.gws[idx] : [];
      if (!fixtures || fixtures.length === 0) return 99;
      if (modelView) {
        const v = total(fixtures);
        return v == null ? 99 : -v;
      }
      return fixtures.reduce((sum, f) => sum + f.difficulty, 0) / fixtures.length;
    };
    return [...data.teams].sort((a, b) => rank(a) - rank(b));
  }, [data, sortKey, modelView, summary, total]);

  const formatSummary = (v: number | null) =>
    v == null ? "—" : view === "fdr" ? String(v) : v.toFixed(view === "attack" ? 1 : 2);

  return (
    <div>
      <Legend view={view} leagueXg={leagueXg} coveredTo={coveredTo} />
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-semibold text-muted-foreground">
                Team
              </th>
              <th
                className="cursor-pointer px-2 py-2 text-center font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground"
                onClick={() => setSortKey("summary")}
                title={VIEW_COPY[view].summaryTitle}
              >
                {VIEW_COPY[view].summary} {sortKey === "summary" && "▾"}
              </th>
              {data.gws.map((g) => (
                <th
                  key={g.id}
                  className="cursor-pointer px-1 py-2 text-center font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground"
                  onClick={() => setSortKey(g.id)}
                  title={`Sort by GW${g.id}`}
                >
                  GW{g.id} {sortKey === g.id && "▾"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((t) => (
              <tr key={t.id}>
                <td className="sticky left-0 z-10 border-b border-border bg-card px-4 py-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <img src={t.badge_url} alt="" className="h-5 w-5" />
                    <span className="font-medium text-foreground">{t.short_name}</span>
                  </div>
                </td>
                <td className="border-b border-border px-2 py-1.5 text-center text-muted-foreground tabular-nums">
                  {formatSummary(summary(t))}
                </td>
                {t.gws.map((fixtures, i) => (
                  <td key={i} className="border-b border-border p-1 align-middle">
                    {fixtures.length === 0 ? (
                      <div
                        className="flex min-h-9 items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground/50"
                        title="No fixture this gameweek"
                      >
                        —
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        {fixtures.map((f, j) => (
                          <FixtureTile key={j} f={f} view={view} leagueXg={leagueXg} />
                        ))}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
