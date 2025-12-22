// right/HotNewsCard.tsx

import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";

type Item = { id: number; name: string; team: string | null; position: number; news: string; news_added: string | null; status: string; start_probability: number; };
type Resp = { items: Item[] };

export default function HotNewsCard() {
  const { data, loading, error } = useFetch<Resp>("/api/news/hot?days=7&limit=5");

  return (
    <DataCard title="Hot News 🔥" loading={loading} error={error} empty={!data || data.items.length === 0}>
      <div className="space-y-3">
        {data?.items.map((t) => (
          <div key={t.id} className="flex gap-3">
            <div className="w-12 h-12 rounded-lg bg-card border border-border grid place-content-center text-xs text-muted-foreground">
              {t.team || "—"}
            </div>
            <div className="flex-1">
              <div className="text-sm text-foreground font-medium">
                {t.name} <span className="text-xs text-muted-foreground">({t.team || "?"})</span>
              </div>
              <div className="text-xs text-muted-foreground">{t.news}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {t.news_added ? new Date(t.news_added).toLocaleString() : "recent"} • start {Math.round(t.start_probability * 100)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </DataCard>
  );
}