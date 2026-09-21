// right/InternationalDutyCard.tsx

import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import { fmtRelTime } from "../../lib/format";
import type { Player } from "../../lib/types";

type NewsItem = { headline: string; published: string | null; link: string | null };
type PlayerNews = { country: string | null; on_squad: boolean | null; news: NewsItem[] };
type Resp = { players: Record<string, PlayerNews> };

export default function InternationalDutyCard({ players }: { players?: Player[] | null }) {
  const ids = (players ?? []).map((p) => p.element);
  const url = ids.length > 0 ? `/api/football/international-news?player_ids=${ids.join(",")}` : null;
  const { data, loading, error } = useFetch<Resp>(url);

  const rows = ids
    .map((id) => ({ player: players!.find((p) => p.element === id)!, info: data?.players[id] }))
    .filter((r) => r.info && r.info.news.length > 0);

  return (
    <DataCard
      title="International Duty"
      loading={loading && !!url}
      error={error}
      empty={!url || rows.length === 0}
      emptyMessage="No international squad news for your players."
    >
      <div className="space-y-3">
        {rows.map(({ player, info }) => {
          const item = info!.news[0];
          return (
            <div key={player.element} className="flex items-start gap-2">
              <span
                className={`inline-block w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                  info!.on_squad === false ? "bg-destructive" : info!.on_squad === true ? "bg-success" : "bg-muted-foreground"
                }`}
                title={info!.on_squad === false ? "Not on current squad list" : info!.on_squad === true ? "On current squad list" : ""}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {player.name} <span className="text-xs text-muted-foreground">({info!.country})</span>
                </div>
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground mt-0.5 line-clamp-2 hover:text-foreground hover:underline block"
                  >
                    {item.headline}
                  </a>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.headline}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-0.5">{fmtRelTime(item.published)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </DataCard>
  );
}
