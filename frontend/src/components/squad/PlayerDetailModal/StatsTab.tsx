import * as React from "react";
import type { Player, PlayerRank } from "../../../lib/types";
import { TONE_CLASS, XGI_COPY, XGI_MIN_MINUTES, xgiSummary } from "../../../lib/utils";
import { SectionHeader, PositionTag } from "./parts";

const POS_STATS: Record<number, Array<{ key: keyof Player; unit: string; rankKey: keyof NonNullable<Player["ranks"]>; primary?: boolean }>> = {
  1: [
    { key: "saves", unit: "SV", rankKey: "saves", primary: true },
    { key: "clean_sheets", unit: "CS", rankKey: "clean_sheets" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
  2: [
    { key: "clean_sheets", unit: "CS", rankKey: "clean_sheets", primary: true },
    { key: "assists", unit: "A", rankKey: "assists" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
  3: [
    { key: "assists", unit: "A", rankKey: "assists", primary: true },
    { key: "goals_scored", unit: "G", rankKey: "goals" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
  4: [
    { key: "goals_scored", unit: "G", rankKey: "goals", primary: true },
    { key: "assists", unit: "A", rankKey: "assists" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
};

function TightRank({ val, unit, rank, primary }: { val: React.ReactNode; unit: string; rank?: PlayerRank; primary?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border bg-muted/30 ${primary ? "border-border/60" : "border-border/40"}`}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-bold text-foreground tabular-nums leading-none tracking-tight">{val ?? "—"}</span>
        <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">{unit}</span>
      </div>
      {rank != null && (
        <>
          <div className="mt-1.5 text-xs text-foreground/80 leading-none">
            #{rank.rank} <span className="text-muted-foreground">of {rank.of}</span>
          </div>
          <div className="mt-1.5 h-0.75 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-none ${primary ? "bg-primary" : "bg-muted-foreground/60"}`}
              style={{ width: `${rank.pct}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function StatsTab({ player, season, posLabel }: {
  player: Player;
  season?: string | null;
  posLabel: string | null;
}) {
  const ga = (player.goals_scored ?? 0) + (player.assists ?? 0);
  const xgiCopy = player.xgi_signal ? XGI_COPY[player.xgi_signal.direction] : null;

  return (
    <div className="space-y-4">
      {/* Season highlights */}
      <section>
        <SectionHeader
          label={season ? `Season highlights · ${season}` : "Season highlights"}
          right={<PositionTag posLabel={posLabel} />}
        />
        <div className="grid grid-cols-3 gap-2">
          {(POS_STATS[player.position] ?? POS_STATS[3]).map(({ key, unit, rankKey, primary }) => {
            const raw = player[key] as string | number | null | undefined;
            const val = raw != null ? (key === "points_per_game" ? Number(raw).toFixed(1) : raw) : null;
            return (
              <TightRank
                key={unit}
                val={val}
                unit={unit}
                rank={player.ranks?.[rankKey]}
                primary={primary}
              />
            );
          })}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {[
            player.position === 3 && player.clean_sheets != null && `${player.clean_sheets} CS`,
            player.position === 2 && player.goals_scored ? `${player.goals_scored} G` : null,
            player.bonus != null && `${player.bonus} bonus`,
            player.minutes != null && `${player.minutes} mins`,
          ].filter(Boolean).join(" · ")}
        </div>
      </section>

      {/* Expected stats — outfield only; a GK's xGI is ~0 */}
      {player.position !== 1 && player.expected_goal_involvements != null && (
        <section>
          <SectionHeader label="Actual vs expected" />
          <div className="grid grid-cols-3 gap-2">
            {[
              { unit: "G", actual: player.goals_scored ?? 0, expected: player.expected_goals, xUnit: "xG" },
              { unit: "A", actual: player.assists ?? 0, expected: player.expected_assists, xUnit: "xA" },
              { unit: "G+A", actual: ga, expected: player.expected_goal_involvements, xUnit: "xGI" },
            ].map(({ unit, actual, expected, xUnit }) => (
              <div key={unit} className="p-3 rounded-xl border border-border/40 bg-muted/30">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-bold text-foreground tabular-nums leading-none tracking-tight">{actual}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">{unit}</span>
                </div>
                <div className="mt-1.5 text-xs text-foreground/80 leading-none tabular-nums">
                  {Number(expected ?? 0).toFixed(1)} <span className="text-muted-foreground">{xUnit}</span>
                </div>
              </div>
            ))}
          </div>
          {player.xgi_signal && xgiCopy ? (
            <div className={`mt-2 px-3 py-2.5 rounded-lg border text-xs leading-snug ${TONE_CLASS[xgiCopy.tone].soft}`}>
              <span className={`font-semibold ${TONE_CLASS[xgiCopy.tone].text}`}>{xgiCopy.label}</span>
              <span className="text-muted-foreground"> · {xgiSummary(player.xgi_signal, ga, player.expected_goal_involvements)}</span>
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">
              {(player.minutes ?? 0) < XGI_MIN_MINUTES
                ? "Too few minutes to judge finishing yet."
                : "Returns in line with chances created."}
            </div>
          )}
        </section>
      )}

      {/* Per 90 */}
      <section>
        <SectionHeader label={`Per 90 · vs ${posLabel ?? "pos"}`} />
        <div className="px-4 py-4 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
          Per-90 data not yet available.
        </div>
      </section>
    </div>
  );
}
