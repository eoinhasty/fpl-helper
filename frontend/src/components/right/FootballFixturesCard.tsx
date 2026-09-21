// right/FootballFixturesCard.tsx

import * as React from "react";
import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";

type Team = { name: string; logo: string | null };
type Fixture = {
  id: string;
  date: string;
  completed: boolean;
  status_detail: string | null;
  round: string | null;
  home: Team;
  away: Team;
  home_goals: number | null;
  away_goals: number | null;
};
type Payload = { source: string; competition: string; fixtures: Fixture[] };

const COMPETITIONS: { value: string; label: string }[] = [
  { value: "international-friendlies", label: "Int'l Friendlies" },
  { value: "nations-league", label: "Nations League" },
  { value: "preseason-friendlies", label: "Club Friendlies" },
  { value: "champions-league", label: "Champions League" },
  { value: "europa-league", label: "Europa League" },
  { value: "conference-league", label: "Conference League" },
];

function FixtureRow({ f }: { f: Fixture }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <div className="flex items-center gap-1.5 font-medium text-foreground min-w-0">
        {f.home.logo && <img src={f.home.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
        <span className="truncate">{f.home.name}</span>
      </div>
      <div className="px-2 text-xs text-muted-foreground shrink-0 text-center">
        {f.completed ? (
          <span className="font-semibold text-foreground">{f.home_goals} – {f.away_goals}</span>
        ) : (
          new Date(f.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        )}
      </div>
      <div className="flex items-center gap-1.5 font-medium text-foreground min-w-0 justify-end">
        <span className="truncate">{f.away.name}</span>
        {f.away.logo && <img src={f.away.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
      </div>
    </div>
  );
}

export default function FootballFixturesCard() {
  const [competition, setCompetition] = React.useState(COMPETITIONS[0].value);
  const { data, loading, error } = useFetch<Payload>(`/api/football/fixtures?competition=${competition}`);

  return (
    <DataCard
      title="International & European Football"
      loading={loading}
      error={error}
      empty={!data || data.fixtures.length === 0}
      emptyMessage="No upcoming fixtures found."
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
      {data && data.fixtures.length > 0 && (
        <div className="mt-1 max-h-64 overflow-auto">
          {data.fixtures.map((f) => <FixtureRow key={f.id} f={f} />)}
        </div>
      )}
    </DataCard>
  );
}
