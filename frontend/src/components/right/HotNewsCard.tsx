// right/HotNewsCard.tsx

import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import { fmtRelTime } from "../../lib/format";

type Item = { id: number; name: string; team: string | null; badge_url: string | null; position: number; news: string; news_added: string | null; status: string; start_probability: number; };
type Resp = { items: Item[] };

const POSITION_LABEL: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

function statusDotClass(status: string): string {
  if (status === "a") return "bg-success";
  if (status === "d") return "bg-warning";
  return "bg-destructive";
}

function startProbClass(prob: number): string {
  if (prob >= 0.7) return "text-success";
  if (prob >= 0.4) return "text-warning";
  return "text-destructive";
}

export default function HotNewsCard() {
  const { data, loading, error } = useFetch<Resp>("/api/news/hot?days=7&limit=5");

  return (
    <DataCard title="Hot News 🔥" loading={loading} error={error} empty={!data || data.items.length === 0}>
      <div className="space-y-3">
        {data?.items.map((t) => (
          <div key={t.id} className="flex gap-3">
            <div className="w-12 h-12 rounded-lg bg-card border border-border grid place-content-center shrink-0">
              {t.badge_url
                ? <img src={t.badge_url} alt={t.team || ""} className="w-8 h-8 object-contain" loading="lazy" />
                : <span className="text-xs text-muted-foreground">{t.team || "—"}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusDotClass(t.status)}`} />
                <span className="truncate">{t.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {t.team || "?"} · {POSITION_LABEL[t.position] ?? "?"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.news}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-1.5">
                <span>{fmtRelTime(t.news_added)}</span>
                <span>·</span>
                <span className={startProbClass(t.start_probability)}>
                  start {Math.round(t.start_probability * 100)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DataCard>
  );
}
