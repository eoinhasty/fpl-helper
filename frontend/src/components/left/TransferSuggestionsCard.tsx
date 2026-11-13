import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import type { TransferSuggestion, TransferSuggestionsResponse } from "../../lib/types";
import { fmtPrice, pct } from "../../lib/format";
import { fdrDotClass, TONE_CLASS } from "../../lib/utils";
import { isAuthenticated } from "../../lib/api";
import PlayerOpen from "../squad/PlayerOpen";

const POS_LABEL: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

function FdrDot({ d }: { d: number }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${fdrDotClass(d)}`} title={`FDR ${d}`} />;
}

function SuggestionRow({ p }: { p: TransferSuggestion }) {
  const fxLabel =
    p.has_dgw && p.fixture
      ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp} • DGW`
      : p.fixture
        ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp}`
        : "BGW";

  // ep_next is already a whole-GW total, so a DGW needs no scaling
  const xPts = p.ep_next ? parseFloat(p.ep_next) : null;
  const statLabel =
    xPts != null && xPts > 0 ? `${xPts.toFixed(1)} xPts` : `${parseFloat(p.form ?? "0").toFixed(1)} form`;
  const own = p.selected_by_percent != null ? `${Number(p.selected_by_percent).toFixed(1)}% own` : null;

  // Why this beats the player it replaces, from the factor the backend found
  // contributes most to the score gain.
  const out = p.replaces;
  const outXPts = out.ep_next ? parseFloat(out.ep_next) : null;
  const xPtsGain = xPts != null && outXPts != null ? xPts - outXPts : null;
  const reason = (() => {
    switch (p.driver) {
      case "blank":
        return { text: "blank GW", cls: TONE_CLASS.destructive.text };
      case "minutes":
        return { text: `${pct(out.start_probability)} to start`, cls: TONE_CLASS.destructive.text };
      case "dgw":
        return { text: "double GW", cls: TONE_CLASS.success.text };
      case "fixture":
        return { text: "easier fixture", cls: TONE_CLASS.success.text };
      case "form":
        return xPtsGain != null && xPtsGain > 0
          ? { text: `+${xPtsGain.toFixed(1)} xPts`, cls: TONE_CLASS.success.text }
          : { text: "better form", cls: TONE_CLASS.success.text };
    }
  })();

  // What the swap does to the bank: suggestions are ranked on score gain alone
  // (a cheaper-near-equivalent weighting lost points in the season backtest),
  // so show the money side and leave that trade-off to the user.
  const bankDelta = out.sell_price - p.price;
  const bankLabel =
    bankDelta === 0 ? "bank ±£0.0" : `bank ${bankDelta > 0 ? "+" : "−"}£${Math.abs(bankDelta / 10).toFixed(1)}`;

  return (
    <li>
      <PlayerOpen
        id={p.element}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-2 py-1.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          {p.shirt_url && <img src={p.shirt_url} alt="" className="h-6 w-6 shrink-0 object-contain" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{p.team}</span>
              <span>·</span>
              {p.fixture && <FdrDot d={p.fixture.difficulty} />}
              <span className="truncate">{fxLabel}</span>
            </div>
            <div
              className="truncate text-[11px] text-muted-foreground"
              title={`Sell ${out.name} (${fmtPrice(out.sell_price)})`}
            >
              for {out.name}
              {reason && (
                <>
                  {" "}
                  · <span className={reason.cls}>{reason.text}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 space-y-0.5 text-right text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">{statLabel}</div>
          <div>
            {fmtPrice(p.price)}
            {own && <> · {own}</>}
          </div>
          <div className={bankDelta > 0 ? TONE_CLASS.success.text : undefined}>{bankLabel}</div>
          {p.start_probability < 0.75 && <div className="text-[10px]">{pct(p.start_probability)} start</div>}
        </div>
      </PlayerOpen>
    </li>
  );
}

export default function TransferSuggestionsCard({ entry, notice }: { entry: number | ""; notice?: React.ReactNode }) {
  const url = entry ? `/api/transfer-suggestions/${entry}` : null;
  // Send the auth token when present so the backend can source suggestions
  // from my_team (works pre-season and stays fresh after a Live-mode
  // transfer) instead of picks; it falls back to picks itself otherwise.
  const { data, loading, error } = useFetch<TransferSuggestionsResponse>(url, { auth: true });

  return (
    <DataCard
      title="Transfer Suggestions"
      loading={loading}
      error={error}
      empty={!entry || !data}
      emptyMessage={!entry ? "Set your entry id to see suggestions." : undefined}
      notice={notice}
    >
      {data && data.season_status === "pre_season" && (
        <div className="text-sm text-muted-foreground">
          {isAuthenticated()
            ? "Suggestions appear once you've drafted your GW1 squad."
            : "Log in on the Live tab to see suggestions before GW1 picks lock in."}
        </div>
      )}
      {data && data.season_status !== "pre_season" && data.suggestions.length === 0 && (
        <div className="text-sm text-muted-foreground">No affordable upgrades on your current squad.</div>
      )}
      {data &&
        data.suggestions.map((group) => (
          <div key={group.position} className="mb-3 last:mb-0">
            <div className="mb-1 text-xs tracking-wide text-muted-foreground uppercase">
              {POS_LABEL[group.position]}
            </div>
            <ul className="space-y-1.5">
              {group.players.map((p) => (
                <SuggestionRow key={p.element} p={p} />
              ))}
            </ul>
          </div>
        ))}
    </DataCard>
  );
}
