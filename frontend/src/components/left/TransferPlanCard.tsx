import * as React from "react";
import DataCard from "../ui/DataCard";
import { Skeleton } from "../ui/Skeleton";
import TransferSuggestionsCard from "./TransferSuggestionsCard";
import { useFetch } from "../../hooks/useFetch";
import { solvePlan, type Plan, type PlanWeek, type TransferPlanResponse } from "../../lib/transferPlan";
import { fmtPrice } from "../../lib/format";
import { TONE_CLASS } from "../../lib/utils";

type Available = Extract<TransferPlanResponse, { available: true }>;

/** Fast devices solve within this and never see the suggestions step (this laptop: ~4 s from the plan response, 2026-11-02) */
const SLOW_SOLVE_MS = 6000;

// 44px touch target without changing the line height (as PlayerTable's "Clear filters")
const LINK_BUTTON =
  "-my-3.5 py-3.5 text-primary-strong font-medium cursor-pointer hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const shirtUrl = (teamCode: number | null, position: number) =>
  teamCode == null
    ? null
    : `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}${position === 1 ? "_1" : ""}-220.webp`;

function fmtBank(delta: number) {
  return delta === 0 ? "bank ±£0.0" : `bank ${delta > 0 ? "+" : "−"}£${Math.abs(delta / 10).toFixed(1)}`;
}

function MoveRow({ out, into, resp, gwIndex }: { out: number; into: number; resp: Available; gwIndex: number }) {
  const o = resp.players[out];
  const i = resp.players[into];
  // The planner buys for the rest of the horizon, not just this GW
  const sum = (pts: number[]) => pts.slice(gwIndex).reduce((s, x) => s + x, 0);
  const gain = sum(i.pts) - sum(o.pts);
  const lastGw = resp.gws[resp.gws.length - 1];
  const bank = o.cost - i.cost;
  const shirt = shirtUrl(i.team_code, i.position);
  return (
    <li className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {shirt && <img src={shirt} alt="" className="w-6 h-6 object-contain shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{i.name}</div>
          <div className="text-[11px] text-muted-foreground truncate" title={`Sell ${o.name} (${fmtPrice(o.cost)})`}>
            {i.team} · for {o.name}
          </div>
          {gain > 0 && (
            <div className={`text-[11px] ${TONE_CLASS.success.text}`}>
              +{gain.toFixed(1)} pts {resp.gws[gwIndex] === lastGw ? "this GW" : `by GW${lastGw}`}
            </div>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 text-xs text-muted-foreground space-y-0.5">
        <div className="font-semibold text-foreground">{i.pts[gwIndex].toFixed(1)} pts</div>
        <div>{fmtPrice(i.cost)}</div>
        <div className={bank > 0 ? TONE_CLASS.success.text : undefined}>{fmtBank(bank)}</div>
      </div>
    </li>
  );
}

function WeekBlock({ week, g, resp }: { week: PlanWeek; g: number; resp: Available }) {
  const wildcard = resp.unlimited_transfers && g === 0;
  const captain = resp.players[week.captain];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          GW{week.gw}
          {g === 0 && " · this week"}
          {wildcard && " · wildcard"}
        </div>
        <div className="text-xs text-muted-foreground">
          {week.hits > 0 && (
            <span className={TONE_CLASS.destructive.text}>−{week.hits * resp.hit_cost} hit · </span>
          )}
          <span className="font-semibold text-foreground">{week.points.toFixed(1)} pts</span>
        </div>
      </div>
      {week.into.length > 0 ? (
        <ul className="space-y-1.5">
          {week.into.map((p, k) => (
            <MoveRow key={p} out={week.out[k]} into={p} resp={resp} gwIndex={g} />
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">No transfer — roll it over</div>
      )}
      <div className="text-[11px] text-muted-foreground mt-1">Captain {captain.name}</div>
    </div>
  );
}

export default function TransferPlanCard({ entry }: { entry: number | "" }) {
  const url = entry ? `/api/transfer-plan/${entry}` : null;
  // Token when present: exact selling prices and free transfers from my_team
  const { data, loading, error } = useFetch<TransferPlanResponse>(url, { auth: true });
  const resp = data?.available ? data : null;

  const [view, setView] = React.useState<{ model: string; mode: "plan" | "suggestions" } | null>(null);
  const [solved, setSolved] = React.useState<{ model: string; plan: Plan | null } | null>(null);
  React.useEffect(() => {
    if (!resp) return;
    let live = true;
    solvePlan(resp).then(
      (plan) => {
        if (!live) return;
        setSolved({ model: resp.model, plan });
        // Solved before SLOW_SOLVE_MS (or from storage): claim the view so the timer doesn't switch to suggestions
        setView((v) => (v?.model === resp.model ? v : { model: resp.model, mode: "plan" }));
      },
      (e: unknown) => {
        console.warn("Transfer plan solve failed; showing suggestions instead", e);
        if (live) setSolved({ model: resp.model, plan: null });
      },
    );
    return () => {
      live = false;
    };
  }, [resp]);
  const plan = resp && solved?.model === resp.model ? solved.plan : undefined;

  // A mid-range phone takes ~20 s to solve. Past SLOW_SOLVE_MS, show this
  // GW's suggestions instead of a skeleton; once the plan is ready the user
  // opens it themselves rather than having the card swap under them.
  React.useEffect(() => {
    if (!resp) return;
    const t = setTimeout(
      () => setView((v) => (v?.model === resp.model ? v : { model: resp.model, mode: "suggestions" })),
      SLOW_SOLVE_MS,
    );
    return () => clearTimeout(t);
  }, [resp]);
  const mode = resp && view?.model === resp.model ? view.mode : null;
  const showMode = (m: "plan" | "suggestions") => resp && setView({ model: resp.model, mode: m });

  // No plan to show (no projections, no squad, or the solve failed): the
  // one-GW suggestions still work from FPL's own data
  if (!entry || error || (data && !resp) || plan === null) return <TransferSuggestionsCard entry={entry} />;

  if (mode === "suggestions") {
    const gws = resp?.gws.length;
    return (
      <TransferSuggestionsCard
        entry={entry}
        notice={
          <div className="text-xs text-muted-foreground mb-2">
            {plan ? (
              <>
                Your {gws}-GW plan is ready ·{" "}
                <button type="button" onClick={() => showMode("plan")} className={LINK_BUTTON}>
                  View
                </button>
              </>
            ) : (
              `Planning your next ${gws} GWs…`
            )}
          </div>
        }
      />
    );
  }

  const solving = !loading && plan === undefined;
  const span = resp ? `GW${resp.gws[0]}–${resp.gws[resp.gws.length - 1]}` : null;
  return (
    <DataCard
      title="Transfer Plan"
      loading={loading}
      right={span && <span className="text-xs text-muted-foreground">{span}</span>}
    >
      {solving && (
        // ~3 s on a desktop, longer on a phone — say what's happening
        <div className="space-y-2 mt-1">
          <div className="text-xs text-muted-foreground">Planning transfers for the next {resp?.gws.length} GWs…</div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}
      {resp && plan && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{plan.total.toFixed(1)} pts</span> projected over{" "}
            {resp.gws.length} GWs, after hits ·{" "}
            {resp.unlimited_transfers
              ? "unlimited transfers"
              : `${resp.free_transfers} free transfer${resp.free_transfers === 1 ? "" : "s"}`}{" "}
            · bank {fmtPrice(resp.bank)}
          </div>
          {plan.weeks.map((w, g) => (
            <WeekBlock key={w.gw} week={w} g={g} resp={resp} />
          ))}
          <div className="text-[11px] text-muted-foreground">
            Plans every week on the points model's projections; later weeks are re-planned as projections update.
            {resp.source === "picks" && " Log in on the Live tab for exact selling prices and free transfers."}
          </div>
          <div className="text-xs">
            <button type="button" onClick={() => showMode("suggestions")} className={LINK_BUTTON}>
              Other options this week
            </button>
          </div>
        </div>
      )}
    </DataCard>
  );
}
