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

type LineupPlayer = {
  id: string | null;
  name: string | null;
  jersey: string | null;
  position: string | null;
  starter: boolean;
  subbed_in: boolean;
  subbed_out: boolean;
  goals: string | null;
  assists: string | null;
  yellow_cards: string | null;
  red_cards: string | null;
};
type LineupTeam = { team: string | null; home_away: string | null; formation: string | null; players: LineupPlayer[] };
type LineupsPayload = { teams: LineupTeam[]; available: boolean };

const COMPETITIONS: { value: string; label: string }[] = [
  { value: "international-friendlies", label: "Int'l Friendlies" },
  { value: "nations-league", label: "Nations League" },
  { value: "preseason-friendlies", label: "Club Friendlies" },
  { value: "champions-league", label: "Champions League" },
  { value: "europa-league", label: "Europa League" },
  { value: "conference-league", label: "Conference League" },
];

function PlayerRow({ p }: { p: LineupPlayer }) {
  const cards = [
    Number(p.yellow_cards) > 0 && <span key="y" className="inline-block w-2 h-2.5 bg-yellow-400 rounded-[1px]" title="Yellow card" />,
    Number(p.red_cards) > 0 && <span key="r" className="inline-block w-2 h-2.5 bg-red-500 rounded-[1px]" title="Red card" />,
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs">
      <span className="text-muted-foreground w-6 shrink-0 text-right">{p.jersey ?? ""}</span>
      <span className={`truncate ${p.subbed_out ? "text-muted-foreground line-through" : "text-foreground"}`}>{p.name}</span>
      {p.subbed_out && <span className="text-muted-foreground shrink-0">↓</span>}
      {cards}
    </div>
  );
}

function LineupPanel({ competition, eventId }: { competition: string; eventId: string }) {
  const { data, loading, error } = useFetch<LineupsPayload>(`/api/football/lineups?competition=${competition}&event=${eventId}`);

  if (loading) return <div className="py-2 text-xs text-muted-foreground">Loading lineups…</div>;
  if (error) return <div className="py-2 text-xs text-muted-foreground">Couldn't load lineups.</div>;
  if (!data || !data.available) return <div className="py-2 text-xs text-muted-foreground">Lineups not announced yet.</div>;

  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      {data.teams.map((t) => (
        <div key={t.home_away ?? t.team}>
          <div className="text-xs font-semibold text-foreground mb-1">
            {t.team} {t.formation && <span className="text-muted-foreground font-normal">({t.formation})</span>}
          </div>
          {t.players.filter((p) => p.starter).map((p) => <PlayerRow key={p.id ?? p.name} p={p} />)}
          {t.players.some((p) => p.subbed_in) && (
            <div className="mt-1 pt-1 border-t border-border">
              {t.players.filter((p) => p.subbed_in).map((p) => <PlayerRow key={p.id ?? p.name} p={p} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FixtureRow({ f, competition, expanded, onToggle }: { f: Fixture; competition: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1.5 text-left hover:bg-muted/50 rounded-sm -mx-1 px-1"
      >
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
      </button>
      {expanded && <LineupPanel competition={competition} eventId={f.id} />}
    </div>
  );
}

export default function FootballFixturesCard() {
  const [competition, setCompetition] = React.useState(COMPETITIONS[0].value);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
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
          onChange={(e) => { setCompetition(e.target.value); setExpandedId(null); }}
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
          {data.fixtures.map((f) => (
            <FixtureRow
              key={f.id}
              f={f}
              competition={competition}
              expanded={expandedId === f.id}
              onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
            />
          ))}
        </div>
      )}
    </DataCard>
  );
}
