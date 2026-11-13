import AppShell from "../components/layout/AppShell";
import Card from "../components/ui/Card";
import DataCard from "../components/ui/DataCard";
import PlayerOpen from "../components/squad/PlayerOpen";
import { useFetch } from "../hooks/useFetch";
import { useEntryId } from "../hooks/useEntryID";
import { PlayerDetailContext, usePlayerDetailHost } from "../hooks/usePlayerDetail";
import type { TrackCaptainRow, TrackRecordGw, TrackRecordResponse } from "../lib/types";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function summarise(gws: TrackRecordGw[]) {
  const corrs = gws.flatMap((g) => (g.rank_corr == null ? [] : [g.rank_corr]));
  const caps = gws.flatMap((g) => (g.captain?.model && g.captain.yours ? [g.captain] : []));
  return {
    corr: avg(corrs),
    topModel: avg(gws.map((g) => g.top_model)),
    topAverage: avg(gws.map((g) => g.top_average)),
    topBest: avg(gws.map((g) => g.top_best)),
    captains: caps.length
      ? {
          gws: caps.length,
          model: caps.reduce((a, c) => a + c.model!.points, 0),
          yours: caps.reduce((a, c) => a + c.yours!.points, 0),
          agreed: caps.filter((c) => c.model!.element === c.yours!.element).length,
        }
      : null,
  };
}

function Tile({ label, value, caption }: { label: string; value: string; caption: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{caption}</div>
    </Card>
  );
}

function CorrCell({ corr }: { corr: number | null }) {
  if (corr == null) return <span className="text-muted-foreground">–</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 tabular-nums">{corr.toFixed(2)}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, corr) * 100}%` }} />
      </div>
    </div>
  );
}

function CaptainCell({ row, strong }: { row: TrackCaptainRow | null | undefined; strong: boolean }) {
  if (!row) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="whitespace-nowrap">
      <PlayerOpen id={row.element} inline>
        {row.name}
      </PlayerOpen>{" "}
      <span className={`tabular-nums ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        {row.points}
      </span>
    </span>
  );
}

export default function TrackRecordPage() {
  const { entry } = useEntryId();
  const { data, loading, error } = useFetch<TrackRecordResponse>(
    `/api/model/track-record${entry ? `?entry=${entry}` : ""}`,
  );
  const playerDetail = usePlayerDetailHost({});
  const gws = [...(data?.gws ?? [])].sort((a, b) => b.gw - a.gw);
  const s = summarise(gws);
  const showCaptains = gws.some((g) => g.captain);
  const anyBackfilled = gws.some((g) => g.backfilled);

  return (
    <PlayerDetailContext.Provider value={playerDetail.open}>
      <AppShell>
        <div className="mx-auto w-full space-y-4 px-4 py-4" style={{ maxWidth: 1100 }}>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Model track record</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              How the points model behind the captain picks, Best XI and transfer plan has done each gameweek
              {data?.season ? ` of ${data.season}` : ""}: what it projected before the deadline against what players
              scored.
            </p>
          </div>

          {gws.length > 0 && (
            <div className={`grid gap-3 sm:grid-cols-2 ${s.captains ? "lg:grid-cols-3" : ""}`}>
              <Tile
                label="Rank correlation"
                value={s.corr == null ? "–" : s.corr.toFixed(2)}
                caption="Average per GW over the players who played. 1 is a perfect order, 0 no better than chance — single-GW points are noisy, so 0.3–0.5 is typical."
              />
              <Tile
                label="Model's top 15"
                value={s.topModel == null ? "–" : `${Math.round(s.topModel)} pts`}
                caption={
                  <>
                    A GW on average, from its 15 highest projected — vs {Math.round(s.topAverage ?? 0)} for an average
                    15 and {Math.round(s.topBest ?? 0)} for the best 15 in hindsight.
                  </>
                }
              />
              {s.captains && (
                <Tile
                  label="Model's captains"
                  value={`${s.captains.model} pts`}
                  caption={
                    <>
                      Over {s.captains.gws} GWs from your XI, vs {s.captains.yours} for yours (before doubling). You
                      agreed {s.captains.agreed} times.
                    </>
                  }
                />
              )}
            </div>
          )}

          <DataCard
            title="By gameweek"
            loading={loading}
            error={error}
            empty={gws.length === 0}
            emptyMessage="The track record starts once a gameweek the model projected has finished."
          >
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="py-2 pr-3 font-medium">GW</th>
                    <th className="py-2 pr-3 font-medium">Rank corr.</th>
                    <th className="py-2 pr-3 text-right font-medium">Model's top 15</th>
                    <th className="py-2 pr-3 text-right font-medium">Average 15</th>
                    <th className="py-2 pr-3 text-right font-medium">Best 15</th>
                    {showCaptains && (
                      <>
                        <th className="py-2 pr-3 pl-3 font-medium">Model's captain</th>
                        <th className="py-2 pr-3 font-medium">Yours</th>
                      </>
                    )}
                    <th className={`py-2 pr-3 font-medium ${showCaptains ? "" : "pl-3"}`}>Best captain</th>
                  </tr>
                </thead>
                <tbody>
                  {gws.map((g) => {
                    const c = g.captain;
                    const modelPts = c?.model?.points ?? -1;
                    const yourPts = c?.yours?.points ?? -1;
                    return (
                      <tr key={g.gw} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                          GW{g.gw}
                          {g.backfilled && (
                            <span className="text-muted-foreground" title="Rebuilt after the fact">
                              †
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-foreground">
                          <CorrCell corr={g.rank_corr} />
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold text-foreground tabular-nums">
                          {g.top_model}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">
                          {Math.round(g.top_average)}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">{g.top_best}</td>
                        {showCaptains && (
                          <>
                            <td className="py-2 pr-3 pl-3 text-foreground">
                              <CaptainCell row={c?.model} strong={modelPts >= yourPts} />
                            </td>
                            <td className="py-2 pr-3 text-foreground">
                              <CaptainCell row={c?.yours} strong={yourPts >= modelPts} />
                            </td>
                          </>
                        )}
                        <td className={`py-2 pr-3 text-foreground ${showCaptains ? "" : "pl-3"}`}>
                          <CaptainCell row={g.best_captain} strong={false} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DataCard>

          {gws.length > 0 && (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>
                Everything is counted over the players who played that GW: the model projects as if a player is
                available, and the app scales that by FPL's chance of playing, so a player who sat out says little about
                it.
              </p>
              <p>
                {showCaptains && "The model's captain is the highest projected outfield starter in your XI that GW. "}
                Best captain is the GW's top scorer across every player, in hindsight. Captain points are the player's
                own — not doubled, no vice-captain.
              </p>
              {!entry && <p>Set your team ID in Settings to compare its captain picks with yours.</p>}
              {anyBackfilled && (
                <p>
                  † Rebuilt after the fact: projections were only kept from GW11 on, so earlier GWs were reproduced by
                  retraining the model on what was known before each deadline. Close to what was shown, not identical.
                </p>
              )}
            </div>
          )}
        </div>
      </AppShell>
      {playerDetail.modal}
    </PlayerDetailContext.Provider>
  );
}
