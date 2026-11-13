// right/NextMatchCard.tsx

import * as React from "react";
import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";

type Fx = {
  home: string;
  away: string;
  home_badge: string | null;
  away_badge: string | null;
  home_difficulty: number | null;
  away_difficulty: number | null;
  kickoff: string | null;
};
type Payload = { gw: number; first: Fx | null; fixtures: Fx[] };

function Row({ f }: { f: Fx }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
        {f.home_badge && <img src={f.home_badge} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
        <span className="truncate">{f.home}</span>
      </div>
      <span className="shrink-0 text-muted-foreground">vs</span>
      <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
        {f.away_badge && <img src={f.away_badge} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
        <span className="truncate">{f.away}</span>
      </div>
      <div className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
        {f.kickoff
          ? new Date(f.kickoff).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "TBD"}
      </div>
    </div>
  );
}

export default function NextMatchCard() {
  const { data, loading, error } = useFetch<Payload>("/api/pl/next-match");
  const [open, setOpen] = React.useState(false);

  return (
    <DataCard
      title="Upcoming Match"
      loading={loading}
      error={error}
      empty={!data || !data.first}
      right={data && <div className="text-xs text-muted-foreground">GW {data.gw}</div>}
    >
      {data?.first && (
        <>
          <div className="mt-2 rounded-lg border border-border bg-card p-3">
            <Row f={data.first} />
          </div>

          <button onClick={() => setOpen((v) => !v)} className="btn-primary mt-3 w-full" aria-expanded={open}>
            {open ? "Hide fixtures" : "All fixtures this GW"}
          </button>

          {open && (
            <div className="mt-3 max-h-64 space-y-1 overflow-auto">
              {data.fixtures.map((f, i) => (
                <Row key={i} f={f} />
              ))}
            </div>
          )}
        </>
      )}
    </DataCard>
  );
}
