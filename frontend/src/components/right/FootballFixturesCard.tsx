// right/FootballFixturesCard.tsx

import * as React from "react";
import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import { SelectMenu } from "../controls/SelectMenu";

type Team = { name: string; short_name: string | null; logo: string | null };
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
    Number(p.yellow_cards) > 0 && (
      <span key="y" className="inline-block h-2.5 w-2 rounded-[1px] bg-yellow-400" title="Yellow card" />
    ),
    Number(p.red_cards) > 0 && (
      <span key="r" className="inline-block h-2.5 w-2 rounded-[1px] bg-red-500" title="Red card" />
    ),
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs">
      <span className="w-6 shrink-0 text-right text-muted-foreground">{p.jersey ?? ""}</span>
      <span className={`truncate ${p.subbed_out ? "text-muted-foreground line-through" : "text-foreground"}`}>
        {p.name}
      </span>
      {p.subbed_out && <span className="shrink-0 text-muted-foreground">↓</span>}
      {cards}
    </div>
  );
}

function LineupPanel({ competition, eventId }: { competition: string; eventId: string }) {
  const { data, loading, error } = useFetch<LineupsPayload>(
    `/api/football/lineups?competition=${competition}&event=${eventId}`,
  );

  if (loading) return <div className="py-2 text-xs text-muted-foreground">Loading lineups…</div>;
  if (error) return <div className="py-2 text-xs text-muted-foreground">Couldn't load lineups.</div>;
  if (!data || !data.available)
    return <div className="py-2 text-xs text-muted-foreground">Lineups not announced yet.</div>;

  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      {data.teams.map((t) => (
        <div key={t.home_away ?? t.team}>
          <div className="mb-1 text-xs font-semibold text-foreground">
            {t.team} {t.formation && <span className="font-normal text-muted-foreground">({t.formation})</span>}
          </div>
          {t.players
            .filter((p) => p.starter)
            .map((p) => (
              <PlayerRow key={p.id ?? p.name} p={p} />
            ))}
          {t.players.some((p) => p.subbed_in) && (
            <div className="mt-1 border-t border-border pt-1">
              {t.players
                .filter((p) => p.subbed_in)
                .map((p) => (
                  <PlayerRow key={p.id ?? p.name} p={p} />
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TeamSide({ team, align }: { team: Team; align: "home" | "away" }) {
  const logo = team.logo && <img src={team.logo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />;
  return (
    <div
      className={`flex min-w-0 flex-1 basis-0 items-center gap-1.5 font-medium text-foreground ${align === "away" ? "justify-end" : ""}`}
    >
      {align === "home" && logo}
      <span className="truncate" title={team.name}>
        {team.short_name ?? team.name}
      </span>
      {align === "away" && logo}
    </div>
  );
}

function FixtureRow({
  f,
  competition,
  expanded,
  onToggle,
}: {
  f: Fixture;
  competition: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="-mx-1 flex w-full cursor-pointer items-center gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-muted/50"
      >
        <TeamSide team={f.home} align="home" />
        <div className="w-12 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
          {f.completed ? (
            <span className="font-semibold text-foreground">
              {f.home_goals} – {f.away_goals}
            </span>
          ) : (
            new Date(f.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
          )}
        </div>
        <TeamSide team={f.away} align="away" />
      </button>
      {expanded && <LineupPanel competition={competition} eventId={f.id} />}
    </div>
  );
}

/** Group fixtures under a header per local calendar day, so each row only
 * needs the kick-off time and the team names get the rest of the width. */
function groupByDay(fixtures: Fixture[]): { label: string; fixtures: Fixture[] }[] {
  const groups = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const label = new Date(f.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const day = groups.get(label);
    if (day) day.push(f);
    else groups.set(label, [f]);
  }
  return [...groups].map(([label, fixtures]) => ({ label, fixtures }));
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
        <SelectMenu<string>
          value={competition}
          options={COMPETITIONS}
          onChange={(v) => {
            setCompetition(v);
            setExpandedId(null);
          }}
          ariaLabel="Competition"
          anchor="bottom end"
          className="w-44 shrink-0"
        />
      }
    >
      {data && data.fixtures.length > 0 && (
        <div className="mt-1 max-h-64 overflow-auto">
          {groupByDay(data.fixtures).map((g) => (
            <div key={g.label}>
              <div className="sticky top-0 z-10 bg-card pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {g.label}
              </div>
              {g.fixtures.map((f) => (
                <FixtureRow
                  key={f.id}
                  f={f}
                  competition={competition}
                  expanded={expandedId === f.id}
                  onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </DataCard>
  );
}
