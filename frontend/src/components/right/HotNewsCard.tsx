// right/HotNewsCard.tsx

import DataCard from "../ui/DataCard";
import PlayerOpen from "../squad/PlayerOpen";
import { useFetch } from "../../hooks/useFetch";
import { fmtRelTime } from "../../lib/format";
import { POSITION_LABEL } from "../../lib/constants";
import { TONE_CLASS, startProbTone, statusTone } from "../../lib/utils";

type Item = {
  id: number;
  name: string;
  team: string | null;
  badge_url: string | null;
  position: number;
  news: string;
  news_added: string | null;
  status: string;
  start_probability: number;
};
type Resp = { items: Item[] };

const statusDotClass = (status: string) => TONE_CLASS[statusTone(status)].bg;
const startProbClass = (prob: number) => TONE_CLASS[startProbTone(prob)].text;

export default function HotNewsCard() {
  const { data, loading, error } = useFetch<Resp>("/api/news/hot?days=7&limit=5");

  return (
    <DataCard title="Hot News 🔥" loading={loading} error={error} empty={!data || data.items.length === 0}>
      <div className="space-y-1">
        {data?.items.map((t) => (
          <PlayerOpen key={t.id} id={t.id} className="-mx-1.5 flex w-[calc(100%+0.75rem)] gap-3 rounded-lg px-1.5 py-1">
            <div className="grid h-12 w-12 shrink-0 place-content-center rounded-lg border border-border bg-card">
              {t.badge_url ? (
                <img src={t.badge_url} alt={t.team || ""} className="h-8 w-8 object-contain" loading="lazy" />
              ) : (
                <span className="text-xs text-muted-foreground">{t.team || "—"}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(t.status)}`} />
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t.team || "?"} · {POSITION_LABEL[t.position] ?? "?"}
                </span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.news}</div>
              <div className="mt-0.5 flex gap-1.5 text-[11px] text-muted-foreground">
                <span>{fmtRelTime(t.news_added)}</span>
                <span>·</span>
                <span className={startProbClass(t.start_probability)}>
                  start {Math.round(t.start_probability * 100)}%
                </span>
              </div>
            </div>
          </PlayerOpen>
        ))}
      </div>
    </DataCard>
  );
}
