// right/StandingsCard.tsx

import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";

type Row = { pos: number; team: string; crest?: string | null; played: number; w: number; d: number; l: number; pts: number; };
type Resp = {
  source: string;
  rows: Row[];
  season_start_date?: string | null;
  is_previous_season_table?: boolean;
};

export default function StandingsCard() {
  const { data, loading, error } = useFetch<Resp>("/api/pl/standings");

  return (
    <DataCard title="Premier League Table" loading={loading} error={error} empty={!data || data.rows.length === 0}>
      {data && (
        <div className="overflow-hidden rounded-xl border border-border">
          {data.is_previous_season_table && (
            <div className="text-xs text-muted-foreground px-3 py-2 border-b border-border">
              New season hasn't started — showing last season's final table.
            </div>
          )}
          <table className="w-full text-sm text-foreground">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th><th className="px-2 text-left">Team</th>
                <th className="px-2 text-center">P</th><th className="px-2 text-center">W</th><th className="px-2 text-center">D</th>
                <th className="px-2 text-center">L</th><th className="px-2 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.pos} className="odd:bg-card even:bg-muted/60">
                  <td className="px-3 py-2">{r.pos}</td>
                  <td className="px-2">
                    <div className="flex items-center gap-1.5">
                      {r.crest && <img src={r.crest} alt="" className="w-4 h-4 object-contain" loading="lazy" />}
                      {r.team}
                    </div>
                  </td>
                  <td className="text-center">{r.played}</td>
                  <td className="text-center">{r.w}</td>
                  <td className="text-center">{r.d}</td>
                  <td className="text-center">{r.l}</td>
                  <td className="text-center font-semibold">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[11px] text-muted-foreground px-3 py-1">Source: {data.source}</div>
        </div>
      )}
    </DataCard>
  );
}