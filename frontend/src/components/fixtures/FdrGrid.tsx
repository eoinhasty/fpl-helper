import * as React from "react";
import type { FdrGridResponse, FdrTeam, FixtureLite } from "../../lib/types";
import { fdrClass } from "../../lib/utils";

type SortKey = "avg" | number;

const FDR_LEVELS = [1, 2, 3, 4, 5] as const;

function FdrLegend() {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
      <span>Easier</span>
      <div className="flex items-center gap-1">
        {FDR_LEVELS.map((d) => (
          <span
            key={d}
            className={`inline-flex h-5 w-5 items-center justify-center rounded ${fdrClass(d)}`}
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
      className={`flex min-h-9 flex-1 items-center justify-center rounded-md text-xs font-medium ${fdrClass(f.difficulty)} ${className}`}
      title={`${f.home ? "Home" : "Away"} vs ${f.opp} • FDR ${f.difficulty}`}
    >
      {f.home ? "v" : "@"}
      {f.opp}
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
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-semibold text-muted-foreground">
                Team
              </th>
              <th
                className="cursor-pointer px-2 py-2 text-center font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground"
                onClick={() => setSortKey("avg")}
                title="Sort by average difficulty across the range shown"
              >
                Avg {sortKey === "avg" && "▾"}
              </th>
              {data.gws.map((g) => (
                <th
                  key={g.id}
                  className="cursor-pointer px-1 py-2 text-center font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground"
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
                <td className="sticky left-0 z-10 border-b border-border bg-card px-4 py-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <img src={t.badge_url} alt="" className="h-5 w-5" />
                    <span className="font-medium text-foreground">{t.short_name}</span>
                  </div>
                </td>
                <td className="border-b border-border px-2 py-1.5 text-center text-muted-foreground tabular-nums">
                  {t.avg_difficulty ?? "—"}
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
