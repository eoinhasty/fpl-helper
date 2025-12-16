// right/NextMatchCard.tsx

import * as React from "react";
import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";

type Fx = { home: string; away: string; home_difficulty: number | null; away_difficulty: number | null; kickoff: string | null; };
type Payload = { gw: number; first: Fx | null; fixtures: Fx[] };

function Row({ f }: { f: Fx }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="font-medium text-foreground">{f.home}</div>
      <span className="text-muted-foreground">vs</span>
      <div className="font-medium text-foreground">{f.away}</div>
      <div className="text-xs text-muted-foreground">
        {f.kickoff
          ? new Date(f.kickoff).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
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
          <div className="mt-2 rounded-lg border border-border p-3 bg-card">
            <Row f={data.first} />
          </div>

          <button onClick={() => setOpen(v => !v)} className="btn-primary mt-3 w-full" aria-expanded={open}>
            {open ? "Hide fixtures" : "All fixtures this GW"}
          </button>

          {open && (
            <div className="mt-3 max-h-64 overflow-auto space-y-1">
              {data.fixtures.map((f, i) => <Row key={i} f={f} />)}
            </div>
          )}
        </>
      )}
    </DataCard>
  );
}