import * as React from "react";
import DataCard from "../ui/DataCard";
import { Skeleton } from "../ui/Skeleton";
import TransferSuggestionsCard from "./TransferSuggestionsCard";
import { Toggle } from "../ui/Toggle";
import { SelectMenu } from "../controls/SelectMenu";
import { useFetch } from "../../hooks/useFetch";
import { usePlanOptions } from "../../hooks/usePlanOptions";
import {
  DEFAULT_PLAN_OPTIONS,
  planQuery,
  planWildcard,
  solvePlan,
  type Plan,
  type PlanOptions,
  type PlanWeek,
  type TransferPlanResponse,
} from "../../lib/transferPlan";
import { fmtPrice } from "../../lib/format";
import { TONE_CLASS } from "../../lib/utils";
import PlayerOpen from "../squad/PlayerOpen";

type Available = Extract<TransferPlanResponse, { available: true }>;

/** Fast devices solve within this and never see the suggestions step (this laptop: ~4 s from the plan response, 2026-11-02) */
const SLOW_SOLVE_MS = 6000;

// 44px touch target without changing the line height (as PlayerTable's "Clear filters")
// Per-move actions: quieter than LINK_BUTTON, since every row has them
const ROW_ACTION =
  "-my-3.5 py-3.5 text-muted-foreground cursor-pointer hover:text-primary-strong hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const LINK_BUTTON =
  "-my-3.5 py-3.5 text-primary-strong font-medium cursor-pointer hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const shirtUrl = (teamCode: number | null, position: number) =>
  teamCode == null
    ? null
    : `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}${position === 1 ? "_1" : ""}-220.webp`;

function fmtBank(delta: number) {
  return delta === 0 ? "bank ±£0.0" : `bank ${delta > 0 ? "+" : "−"}£${Math.abs(delta / 10).toFixed(1)}`;
}

/** Adds a keep / don't-buy option from a move; null while re-planning */
type Constrain = { keep: (id: number) => void; exclude: (id: number) => void } | null;

function MoveRow({
  out,
  into,
  resp,
  gwIndex,
  constrain,
}: {
  out: number;
  into: number;
  resp: Available;
  gwIndex: number;
  constrain: Constrain;
}) {
  const o = resp.players[out];
  const i = resp.players[into];
  // The planner buys for the rest of the horizon, not just this GW
  const sum = (pts: number[]) => pts.slice(gwIndex).reduce((s, x) => s + x, 0);
  const gain = sum(i.pts) - sum(o.pts);
  const lastGw = resp.gws[resp.gws.length - 1];
  const bank = o.cost - i.cost;
  const shirt = shirtUrl(i.team_code, i.position);
  // Only the current squad can be kept (planner.build holds it from the first GW)
  const canKeep = resp.squad.includes(out);
  return (
    <li className="rounded-lg border border-border bg-card px-1 py-1">
      <PlayerOpen id={into} className="w-full flex items-center justify-between gap-2 rounded-md px-1 py-0.5">
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
      </PlayerOpen>
      {constrain && (
        <div className="flex flex-wrap gap-x-4 text-[11px] mt-1 px-1">
          {canKeep && (
            <button type="button" onClick={() => constrain.keep(out)} className={ROW_ACTION}>
              Keep {o.name}
            </button>
          )}
          <button type="button" onClick={() => constrain.exclude(into)} className={ROW_ACTION}>
            Don't buy {i.name}
          </button>
        </div>
      )}
    </li>
  );
}

/** Bank after each planned GW's moves. Costs are selling prices for the
 * current squad and buying prices otherwise, as the solver's budget sees them
 * (a player bought and sold within the plan is assumed to hold his price). */
function runningBank(weeks: PlanWeek[], resp: Available): number[] {
  let bank = resp.bank;
  return weeks.map((w) => {
    bank += w.out.reduce((s, p) => s + resp.players[p].cost, 0) - w.into.reduce((s, p) => s + resp.players[p].cost, 0);
    return bank;
  });
}

function WeekBlock({
  week,
  g,
  resp,
  bank,
  constrain,
}: {
  week: PlanWeek;
  g: number;
  resp: Available;
  bank: number;
  constrain: Constrain;
}) {
  const wildcard = week.gw === planWildcard(resp);
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
          {week.into.length > 0 && <>bank {fmtPrice(bank)} · </>}
          <span className="font-semibold text-foreground">{week.points.toFixed(1)} pts</span>
        </div>
      </div>
      {week.into.length > 0 ? (
        <ul className="space-y-1.5">
          {week.into.map((p, k) => (
            <MoveRow key={p} out={week.out[k]} into={p} resp={resp} gwIndex={g} constrain={constrain} />
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">No transfer — roll it over</div>
      )}
      <div className="text-[11px] text-muted-foreground mt-1">
        Captain <PlayerOpen id={week.captain} inline>{captain.name}</PlayerOpen>
      </div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 pl-2.5 text-xs text-foreground">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove: ${label}`}
        className="-my-2 h-11 w-8 rounded-full text-muted-foreground cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ×
      </button>
    </span>
  );
}

function PlanControls({
  options,
  setOptions,
  resp,
}: {
  options: PlanOptions;
  setOptions: (o: PlanOptions) => void;
  resp: Available;
}) {
  const wildcardGws = resp.wildcard_gws;
  return (
    <div className="border-y border-border">
      <Toggle
        label="Avoid hits"
        checked={options.no_hits}
        onChange={(no_hits) => setOptions({ ...options, no_hits })}
      />
      {wildcardGws.length > 0 && (
        <div className="flex items-center justify-between gap-3 pb-2">
          <span className="text-sm font-medium text-foreground">Wildcard</span>
          <SelectMenu<number | null>
            ariaLabel="Plan a wildcard"
            value={options.wildcard}
            options={[{ label: "Not planned", value: null }, ...wildcardGws.map((gw) => ({ label: `GW${gw}`, value: gw }))]}
            onChange={(wildcard) => setOptions({ ...options, wildcard })}
            anchor="bottom end"
            className="w-36"
          />
        </div>
      )}
      {(options.keep.length > 0 || options.exclude.length > 0) && (
        <div className="flex flex-wrap gap-1.5 pb-2">
          {options.keep.map((id) => (
            <Chip
              key={`k${id}`}
              label={`Keep ${resp.players[id]?.name ?? "player"}`}
                onRemove={() => setOptions({ ...options, keep: options.keep.filter((k) => k !== id) })}
            />
          ))}
          {options.exclude.map((p) => (
            <Chip
              key={`x${p.id}`}
              label={`Don't buy ${p.name}`}
                onRemove={() => setOptions({ ...options, exclude: options.exclude.filter((x) => x.id !== p.id) })}
            />
          ))}
          <button
            type="button"
            onClick={() => setOptions({ ...options, keep: [], exclude: [] })}
            className={`${LINK_BUTTON} text-xs ml-1`}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export default function TransferPlanCard({ entry }: { entry: number | "" }) {
  const [options, setOptions] = usePlanOptions(entry);
  const url = entry ? `/api/transfer-plan/${entry}${planQuery(options)}` : null;
  // Token when present: exact selling prices and free transfers from my_team
  const { data, loading, error } = useFetch<TransferPlanResponse>(url, { auth: true });
  const resp = data?.available ? data : null;

  // Options that no longer apply (a kept player sold, a wildcard week
  // passed) are dropped by the backend; forget them here too
  React.useEffect(() => {
    if (resp && planQuery(resp.options) !== planQuery(options)) setOptions(resp.options);
  }, [resp, options, setOptions]);

  // The last plan shown: after an option change it stays on screen, dimmed,
  // until the new one is solved, instead of dropping back to a skeleton
  const [shown, setShown] = React.useState<{ entry: number; resp: Available; plan: Plan } | null>(null);
  const previous = shown?.entry === entry ? shown : null;

  const [view, setView] = React.useState<{ model: string; mode: "plan" | "suggestions" } | null>(null);
  const [solved, setSolved] = React.useState<{ model: string; plan: Plan | null } | null>(null);
  React.useEffect(() => {
    if (!resp) return;
    let live = true;
    solvePlan(resp).then(
      (plan) => {
        if (!live) return;
        setSolved({ model: resp.model, plan });
        setShown({ entry: resp.entry_id, resp, plan });
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
  // opens it themselves rather than having the card swap under them. Not
  // after an option change, where the user is already working with a plan.
  const hasShown = previous !== null;
  React.useEffect(() => {
    if (!resp || hasShown) return;
    const t = setTimeout(
      () => setView((v) => (v?.model === resp.model ? v : { model: resp.model, mode: "suggestions" })),
      SLOW_SOLVE_MS,
    );
    return () => clearTimeout(t);
  }, [resp, hasShown]);
  const mode = resp && view?.model === resp.model ? view.mode : null;
  const showMode = (m: "plan" | "suggestions") => resp && setView({ model: resp.model, mode: m });

  const custom = planQuery(options) !== "";
  const failed = Boolean(error) || plan === null;
  // No plan to show (no projections, no squad, or the solve failed): the
  // one-GW suggestions still work from FPL's own data. With options set, the
  // card stays and offers a reset instead.
  if (!entry || (data && !resp) || (failed && !custom)) return <TransferSuggestionsCard entry={entry} />;

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
  const current = resp && plan ? { resp, plan } : null;
  const replanning = !current && !failed && previous !== null;
  const display = current ?? previous;
  const spanResp = display?.resp ?? resp;
  const span = spanResp ? `GW${spanResp.gws[0]}–${spanResp.gws[spanResp.gws.length - 1]}` : null;
  const constrain: Constrain =
    replanning || failed || !display
      ? null
      : {
          keep: (id) => setOptions({ ...options, keep: [...options.keep, id] }),
          exclude: (id) =>
            setOptions({ ...options, exclude: [...options.exclude, { id, name: display.resp.players[id].name }] }),
        };
  return (
    <DataCard
      title="Transfer Plan"
      loading={loading && !display}
      right={span && <span className="text-xs text-muted-foreground">{span}</span>}
    >
      {failed && (
        <div className="text-xs text-muted-foreground mb-2" role="status">
          Couldn't plan with these options ·{" "}
          <button type="button" onClick={() => setOptions(DEFAULT_PLAN_OPTIONS)} className={LINK_BUTTON}>
            Reset
          </button>
        </div>
      )}
      {solving && !display && (
        // ~3 s on a desktop, longer on a phone — say what's happening
        <div className="space-y-2 mt-1">
          <div className="text-xs text-muted-foreground">Planning transfers for the next {resp?.gws.length} GWs…</div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}
      {display && (
        <PlanBody
          resp={display.resp}
          plan={display.plan}
          options={options}
          setOptions={setOptions}
          replanning={replanning}
          constrain={constrain}
          onSuggestions={() => showMode("suggestions")}
        />
      )}
    </DataCard>
  );
}

function PlanBody({
  resp,
  plan,
  options,
  setOptions,
  replanning,
  constrain,
  onSuggestions,
}: {
  resp: Available;
  plan: Plan;
  options: PlanOptions;
  setOptions: (o: PlanOptions) => void;
  replanning: boolean;
  constrain: Constrain;
  onSuggestions: () => void;
}) {
  const banks = runningBank(plan.weeks, resp);
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{plan.total.toFixed(1)} pts</span> projected over{" "}
        {resp.gws.length} GWs, after hits ·{" "}
        {resp.unlimited_transfers
          ? "unlimited transfers"
          : `${resp.free_transfers} free transfer${resp.free_transfers === 1 ? "" : "s"}`}{" "}
        · bank {fmtPrice(resp.bank)}
      </div>
      <PlanControls options={options} setOptions={setOptions} resp={resp} />
      {replanning && (
        <div className="text-xs text-muted-foreground" role="status">
          Re-planning with your changes…
        </div>
      )}
      <div className={`space-y-3 transition-opacity ${replanning ? "opacity-50" : ""}`} aria-busy={replanning}>
        {plan.weeks.map((w, g) => (
          <WeekBlock key={w.gw} week={w} g={g} resp={resp} bank={banks[g]} constrain={constrain} />
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground">
        Plans every week on the points model's projections; later weeks are re-planned as projections update.
        {resp.source === "picks" && " Log in on the Live tab for exact selling prices and free transfers."}
      </div>
      <div className="text-xs">
        <button type="button" onClick={onSuggestions} className={LINK_BUTTON}>
          Other options this week
        </button>
      </div>
    </div>
  );
}
