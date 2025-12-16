// left/LeaguesCard.tsx
import * as React from "react";
import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import { num, delta } from "../../lib/format";

type LeagueRow = { id: number; name: string; rank: number | null; last_rank: number | null };
type LeaguesResp = {
  entry_id: number;
  overall_rank: number | null;
  event_rank: number | null;
  classic: LeagueRow[];
  h2h: LeagueRow[];
};

export default function LeaguesCard({ entry }: { entry: number | "" }) {
  const url = entry ? `/api/leagues/${entry}` : null;
  const { data, loading, error } = useFetch<LeaguesResp>(url);

  return (
    <DataCard
      title="Leagues & Ranks"
      loading={loading}
      error={error}
      empty={!entry || !data}
    >
      {!entry && (
        <div className="text-sm text-muted-foreground">
          Set your entry id to see leagues.
        </div>
      )}

      {data && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Tile label="Overall Rank" value={num(data.overall_rank)} />
            <Tile label="GW Rank" value={num(data.event_rank)} />
          </div>

          <Section title="Classic" rows={data.classic} />
          <Section title="Head-to-Head" rows={data.h2h} />
        </>
      )}
    </DataCard>
  );
}

/* ---------- small pieces ---------- */

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: LeagueRow[] }) {
  const items = React.useMemo(() => rows ?? [], [rows]);
  const emptyText = `No ${title.toLowerCase()} leagues.`;

  return (
    <>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {title}
      </div>

      <ul role="list" aria-label={title} className="space-y-1 mb-3">
        {items.length === 0 && (
          <li className="text-sm text-muted-foreground">{emptyText}</li>
        )}
        {items.map((l) => (
          <LeagueItem key={l.id} row={l} />
        ))}
      </ul>
    </>
  );
}

function LeagueItem({ row }: { row: LeagueRow }) {
  const d = delta(row.rank, row.last_rank);
  const improved =
    row.rank != null &&
    row.last_rank != null &&
    row.last_rank - row.rank > 0;

  return (
    <li className="flex items-center justify-between rounded-md border border-border bg-card px-2 py-1.5">
      <span className="text-sm text-foreground truncate">{row.name}</span>

      <span className="inline-flex items-center gap-2">
        {d && (
          <span className={`text-[11px] ${improved ? "text-success" : "text-destructive"}`}>
            {d}
          </span>
        )}
        <span className="text-xs rounded-full border border-border px-2 py-0.5 bg-card text-foreground">
          {num(row.rank)}
        </span>
      </span>
    </li>
  );
}