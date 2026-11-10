import type { ReactNode } from "react";
import type { FixturePoints, PointsLine } from "../../../lib/types";
import { fmtKickoff, ordinal } from "../../../lib/format";
import { SectionHeader } from "./parts";

const LINE_LABEL: Record<string, string> = {
  minutes: "Minutes",
  goals_scored: "Goals",
  assists: "Assists",
  clean_sheets: "Clean sheet",
  goals_conceded: "Goals conceded",
  own_goals: "Own goal",
  penalties_saved: "Penalty saved",
  penalties_missed: "Penalty missed",
  yellow_cards: "Yellow card",
  red_cards: "Red card",
  saves: "Saves",
  defensive_contribution: "Defensive contribution",
};

// One-off events, where a count of 1 says nothing the label doesn't
const FLAG_LINES = new Set(["clean_sheets", "yellow_cards", "red_cards"]);

function lineLabel(id: string): string {
  return LINE_LABEL[id] ?? id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function lineValue({ identifier, value }: PointsLine): string {
  if (identifier === "minutes") return `${value}'`;
  if (FLAG_LINES.has(identifier) && value === 1) return "";
  return String(value);
}

function Pts({ n, muted }: { n: number; muted?: boolean }) {
  const tone = muted ? "text-muted-foreground" : n < 0 ? "text-destructive" : "text-foreground";
  return <span className={`tabular-nums font-semibold text-right ${tone}`}>{n > 0 ? `+${n}` : n}</span>;
}

function Row({ label, value, children }: { label: ReactNode; value?: string; children: ReactNode }) {
  return (
    <div className="grid items-baseline gap-3 py-1" style={{ gridTemplateColumns: "1fr auto 2.5rem" }}>
      <span className="text-foreground/80 min-w-0">{label}</span>
      <span className="tabular-nums text-muted-foreground">{value}</span>
      {children}
    </div>
  );
}

function matchState(f: FixturePoints): string {
  if (!f.started) return "Not started";
  if (!f.finished) return "In play";
  return f.bonus_provisional ? "Full time · bonus to come" : "Full time";
}

function bpsNote(f: FixturePoints): string | null {
  if (f.bps == null || f.bps_rank == null) return null;
  const place = `${ordinal(f.bps_rank)} in the match`;
  // Only worth saying while the bonus can still change
  const gap = f.bonus_provisional && f.bps_to_bonus != null ? ` · ${f.bps_to_bonus} short of bonus` : "";
  return `BPS ${f.bps} · ${place}${gap}`;
}

function FixtureBlock({ f }: { f: FixturePoints }) {
  const note = bpsNote(f);
  return (
    <div className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm">
      <div className="flex items-baseline justify-between gap-3 pb-1.5 mb-0.5 border-b border-border/60">
        <span className="font-semibold text-foreground">
          {f.opp ? `${f.home ? "vs" : "@"} ${f.opp}` : "Fixture"}
        </span>
        <span className="text-xs text-muted-foreground">{matchState(f)}</span>
      </div>
      {!f.started ? (
        <div className="py-1 text-muted-foreground">Kicks off {fmtKickoff(f.kickoff)}.</div>
      ) : f.minutes === 0 ? (
        <div className="py-1 text-muted-foreground">{f.finished ? "Didn't play." : "Hasn't come on yet."}</div>
      ) : (
        <>
          {f.stats.map((s) => (
            <Row key={s.identifier} label={lineLabel(s.identifier)} value={lineValue(s)}>
              <Pts n={s.points} />
            </Row>
          ))}
          {f.bonus > 0 && (
            <Row
              label={
                <>
                  Bonus
                  {f.bonus_provisional && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-warning">
                      provisional
                    </span>
                  )}
                </>
              }
            >
              <Pts n={f.bonus} muted={f.bonus_provisional} />
            </Row>
          )}
        </>
      )}
      {note && <div className="pt-1.5 mt-0.5 border-t border-border/60 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

/** The scoring lines behind a player's GW points, one block per fixture, with
 * where they stand for bonus. Hidden until one of the GW's fixtures starts. */
export default function PointsBreakdown({ breakdown, points, gw }: {
  breakdown: FixturePoints[];
  points: number | undefined;
  gw: number | undefined;
}) {
  if (!breakdown.some((f) => f.started)) return null;
  const provisional = breakdown.reduce((sum, f) => sum + (f.bonus_provisional ? f.bonus : 0), 0);

  return (
    <section>
      <SectionHeader
        label={gw ? `GW${gw} points` : "GW points"}
        right={
          <span className="text-xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{points ?? 0} pts</span>
            {provisional > 0 && ` +${provisional} bonus`}
          </span>
        }
      />
      <div className="flex flex-col gap-2">
        {breakdown.map((f) => (
          <FixtureBlock key={f.fixture} f={f} />
        ))}
      </div>
    </section>
  );
}
