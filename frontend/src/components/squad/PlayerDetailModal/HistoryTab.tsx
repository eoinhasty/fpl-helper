import type { PlayerSummaryResponse } from "../../../lib/types";
import { SectionHeader } from "./parts";

export default function HistoryTab({ history }: {
  history: { data: PlayerSummaryResponse | null; loading: boolean; error: string | null };
}) {
  const past = history.data?.history_past ?? [];
  return (
    <div className="space-y-4">
      <section>
        <SectionHeader label="Past seasons" />
        {history.loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {history.error && <div className="text-sm text-destructive">{history.error}</div>}
        {!history.loading && !history.error && past.length === 0 && (
          <div className="text-sm text-muted-foreground">No prior-season history.</div>
        )}
        {!history.loading && !history.error && past.length > 0 && (
          <div className="flex flex-col gap-2">
            {past.map((h) => (
              <div
                key={h.season_name}
                className="flex items-center justify-between border border-border rounded-xl px-4 py-3 bg-muted/30"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">{h.season_name}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {h.minutes} mins · {h.goals_scored}G {h.assists}A
                  </span>
                </div>
                <span className="text-sm font-bold tabular-nums text-foreground">{h.total_points} pts</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
