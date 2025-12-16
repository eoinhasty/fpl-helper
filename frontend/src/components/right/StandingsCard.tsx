// right/StandingsCard.tsx

import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";

type Row = { pos: number; team: string; played: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; };
type Resp = { source: string; rows: Row[] };

export default function StandingsCard() {
  const { data, loading, error } = useFetch<Resp>("/api/pl/standings");

  return (
    <DataCard title="Premier League Table" loading={loading} error={error} empty={!data || data.rows.length === 0}>
      {data && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm text-foreground">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th><th className="px-2 text-left">Team</th>
                <th className="px-2 text-center">P</th><th className="px-2 text-center">W</th><th className="px-2 text-center">D</th>
                <th className="px-2 text-center">L</th><th className="px-2 text-center">GF</th><th className="px-2 text-center">GA</th>
                <th className="px-2 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.pos} className="odd:bg-card even:bg-muted/60">
                  <td className="px-3 py-2">{r.pos}</td>
                  <td className="px-2">{r.team}</td>
                  <td className="text-center">{r.played}</td>
                  <td className="text-center">{r.w}</td>
                  <td className="text-center">{r.d}</td>
                  <td className="text-center">{r.l}</td>
                  <td className="text-center">{r.gf}</td>
                  <td className="text-center">{r.ga}</td>
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