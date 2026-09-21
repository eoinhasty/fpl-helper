// right/FootballStandingsCard.tsx

import * as React from "react";
import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";

type Row = {
  rank: number;
  team: string | null;
  logo: string | null;
  group: string | null;
  played: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
};
type Payload = { source: string; competition: string; groups: Row[][] };

// Only competitions that are an actual league table — friendlies have none.
const COMPETITIONS: { value: string; label: string }[] = [
  { value: "champions-league", label: "Champions League" },
  { value: "europa-league", label: "Europa League" },
  { value: "conference-league", label: "Conference League" },
  { value: "nations-league", label: "Nations League" },
];

function GroupTable({ rows, showHeading }: { rows: Row[]; showHeading: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {showHeading && rows[0]?.group && (
        <div className="text-xs font-semibold text-foreground px-3 py-1.5 bg-muted border-b border-border">
          {rows[0].group}
        </div>
      )}
      <table className="w-full text-sm text-foreground table-fixed">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="w-6 px-3 py-2 text-left">#</th><th className="text-left">Team</th>
            <th className="w-6 text-center">P</th><th className="w-6 text-center">W</th>
            <th className="w-8 text-center">GD</th><th className="w-8 pr-3 text-center">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank} className="odd:bg-card even:bg-muted/60">
              <td className="px-3 py-2">{r.rank}</td>
              <td className="pr-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {r.logo && <img src={r.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
                  <span className="truncate" title={r.team ?? undefined}>{r.team}</span>
                </div>
              </td>
              <td className="text-center">{r.played}</td>
              <td className="text-center">{r.w}</td>
              <td className="text-center">{r.gf - r.ga >= 0 ? "+" : ""}{r.gf - r.ga}</td>
              <td className="pr-3 text-center font-semibold">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FootballStandingsCard() {
  const [competition, setCompetition] = React.useState(COMPETITIONS[0].value);
  const { data, loading, error } = useFetch<Payload>(`/api/football/standings?competition=${competition}`);

  const groups = data?.groups ?? [];

  return (
    <DataCard
      title="International & European Standings"
      loading={loading}
      error={error}
      empty={!data || groups.length === 0}
      emptyMessage="No standings available yet."
      right={
        <select
          value={competition}
          onChange={(e) => setCompetition(e.target.value)}
          className="text-xs rounded-lg border border-border bg-card text-foreground px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Competition"
        >
          {COMPETITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      }
    >
      {groups.length > 0 && (
        <div className="mt-1 max-h-72 overflow-auto space-y-3">
          {groups.map((rows, i) => (
            <GroupTable key={rows[0]?.group ?? i} rows={rows} showHeading={groups.length > 1} />
          ))}
        </div>
      )}
    </DataCard>
  );
}
