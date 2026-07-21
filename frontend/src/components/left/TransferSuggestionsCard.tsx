import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import type { TransferSuggestion, TransferSuggestionsResponse } from "../../lib/types";
import { fmtPrice, pct } from "../../lib/format";
import { fdrDotClass } from "../../lib/utils";

const POS_LABEL: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

function FdrDot({ d }: { d: number }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${fdrDotClass(d)}`} title={`FDR ${d}`} />;
}

function SuggestionRow({ p }: { p: TransferSuggestion }) {
  const fxLabel = p.has_dgw && p.fixture
    ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp} • DGW`
    : p.fixture
    ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp}`
    : "BGW";

  const xPts = p.ep_next ? parseFloat(p.ep_next) : null;
  const statLabel = xPts != null && xPts > 0
    ? `${(p.has_dgw ? xPts * 2 : xPts).toFixed(1)} xPts`
    : `${parseFloat(p.form ?? "0").toFixed(1)} form`;

  return (
    <li className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {p.shirt_url && (
          <img
            src={p.shirt_url}
            alt=""
            className="w-6 h-6 object-contain shrink-0"
          />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{p.team}</span>
            <span>·</span>
            {p.fixture && <FdrDot d={p.fixture.difficulty} />}
            <span className="truncate">{fxLabel}</span>
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 text-xs text-muted-foreground space-y-0.5">
        <div className="font-semibold text-foreground">{statLabel}</div>
        <div>{fmtPrice(p.price)}</div>
        {p.start_probability < 0.75 && (
          <div className="text-[10px]">{pct(p.start_probability)} start</div>
        )}
      </div>
    </li>
  );
}

export default function TransferSuggestionsCard({ entry }: { entry: number | "" }) {
  const url = entry ? `/api/transfer-suggestions/${entry}` : null;
  const { data, loading, error } = useFetch<TransferSuggestionsResponse>(url);

  return (
    <DataCard
      title="Transfer Suggestions"
      loading={loading}
      error={error}
      empty={!entry || !data}
    >
      {!entry && (
        <div className="text-sm text-muted-foreground">Set your entry id to see suggestions.</div>
      )}
      {data && data.suggestions.length === 0 && (
        <div className="text-sm text-muted-foreground">No suggestions available.</div>
      )}
      {data && data.suggestions.map((group) => (
        <div key={group.position} className="mb-3 last:mb-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
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
