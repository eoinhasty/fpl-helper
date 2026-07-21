import * as React from "react";
import type { FdrGridResponse, FdrTeam, FixtureLite } from "../../lib/types";
import { fdrClass } from "../../lib/utils";

type SortKey = "avg" | number;

const FDR_LEVELS = [1, 2, 3, 4, 5] as const;

function FdrLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
      <span>Easier</span>
      <div className="flex items-center gap-1">
        {FDR_LEVELS.map((d) => (
          <span
            key={d}
            className={`inline-flex items-center justify-center w-5 h-5 rounded ${fdrClass(d)}`}
            title={`FDR ${d}`}
          >
            {d}
          </span>
        ))}
      </div>
      <span>Harder</span>
    </div>
  );
}

/** One heatmap tile: the fixture's FDR color fills the whole cell, not a pill floating inside it. */
function FixtureTile({ f, className = "" }: { f: FixtureLite; className?: string }) {
  return (
    <div
      className={`flex-1 flex items-center justify-center rounded-md text-xs font-medium min-h-9 ${fdrClass(f.difficulty)} ${className}`}
      title={`${f.home ? "Home" : "Away"} vs ${f.opp} • FDR ${f.difficulty}`}
    >
      {f.home ? "v" : "@"}{f.opp}
    </div>
  );
}

export default function FdrGrid({ data }: { data: FdrGridResponse }) {
  const [sortKey, setSortKey] = React.useState<SortKey>("avg");

  const sortedTeams = React.useMemo(() => {
    const rank = (t: FdrTeam): number => {
      if (sortKey === "avg") return t.avg_difficulty ?? 99;
      const idx = data.gws.findIndex((g) => g.id === sortKey);
      const fixtures = idx >= 0 ? t.gws[idx] : [];
      if (!fixtures || fixtures.length === 0) return 99;
      return fixtures.reduce((sum, f) => sum + f.difficulty, 0) / fixtures.length;
    };
    return [...data.teams].sort((a, b) => rank(a) - rank(b));
  }, [data, sortKey]);

  return (
    <div>
      <FdrLegend />
      <div className="overflow-x-auto -mx-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card text-left px-4 py-2 font-semibold text-muted-foreground">
                Team
              </th>
              <th
                className="px-2 py-2 font-semibold text-center cursor-pointer hover:text-foreground text-muted-foreground whitespace-nowrap"
                onClick={() => setSortKey("avg")}
                title="Sort by average difficulty across the range shown"
              >
                Avg {sortKey === "avg" && "▾"}
              </th>
              {data.gws.map((g) => (
                <th
                  key={g.id}
                  className="px-1 py-2 font-semibold text-center cursor-pointer hover:text-foreground text-muted-foreground whitespace-nowrap"
                  onClick={() => setSortKey(g.id)}
                  title={`Sort by GW${g.id} difficulty`}
                >
                  GW{g.id} {sortKey === g.id && "▾"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((t) => (
              <tr key={t.id}>
                <td className="sticky left-0 z-10 bg-card px-4 py-1.5 whitespace-nowrap border-b border-border">
                  <div className="flex items-center gap-2">
                    <img src={t.badge_url} alt="" className="w-5 h-5" />
                    <span className="font-medium text-foreground">{t.short_name}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-center text-muted-foreground tabular-nums border-b border-border">
                  {t.avg_difficulty ?? "—"}
                </td>
                {t.gws.map((fixtures, i) => (
                  <td key={i} className="p-1 align-middle border-b border-border">
                    {fixtures.length === 0 ? (
                      <div
                        className="flex items-center justify-center rounded-md min-h-9 bg-muted/30 text-muted-foreground/50 text-xs"
                        title="No fixture this gameweek"
                      >
                        —
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        {fixtures.map((f, j) => (
                          <FixtureTile key={j} f={f} />
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
