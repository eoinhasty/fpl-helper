// right/InternationalDutyCard.tsx

import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import { fmtRelTime } from "../../lib/format";
import type { Player } from "../../lib/types";
import {
  CheckCircleIcon,
  ArrowUpCircleIcon,
  ArrowDownCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@heroicons/react/16/solid";

type NewsItem = { headline: string; published: string | null; link: string | null };
type RecentMatch = {
  competition: string;
  opponent: string | null;
  in_squad: boolean;
  starter?: boolean | null;
  subbed_in?: boolean | null;
  subbed_out?: boolean | null;
};
type PlayerNews = { country: string | null; on_squad: boolean | null; news: NewsItem[]; recent_match: RecentMatch | null };
type Resp = { players: Record<string, PlayerNews> };

function matchBadge(m: RecentMatch): { Icon: typeof CheckCircleIcon; color: string; label: string } {
  if (!m.in_squad) return { Icon: XCircleIcon, color: "text-muted-foreground", label: "Not in squad" };
  if (m.starter && m.subbed_out) return { Icon: ArrowDownCircleIcon, color: "text-warning", label: "Subbed off" };
  if (m.starter) return { Icon: CheckCircleIcon, color: "text-success", label: "Started" };
  if (m.subbed_in) return { Icon: ArrowUpCircleIcon, color: "text-success", label: "Came on" };
  return { Icon: ClockIcon, color: "text-muted-foreground", label: "Unused sub" };
}

export default function InternationalDutyCard({ players }: { players?: Player[] | null }) {
  const ids = (players ?? []).map((p) => p.element);
  const url = ids.length > 0 ? `/api/football/international-news?player_ids=${ids.join(",")}` : null;
  const { data, loading, error } = useFetch<Resp>(url);

  const rows = ids
    .map((id) => ({ player: players!.find((p) => p.element === id)!, info: data?.players[id] }))
    .filter((r) => r.info && (r.info.news.length > 0 || r.info.recent_match));

  return (
    <DataCard
      title="International Duty"
      loading={loading && !!url}
      error={error}
      empty={!url || rows.length === 0}
      emptyMessage="No international squad news for your players."
    >
      <div className="space-y-2.5">
        {rows.map(({ player, info }) => {
          const item = info!.news[0];
          const match = info!.recent_match;
          const badge = match ? matchBadge(match) : null;
          return (
            <div key={player.element} className="flex items-start gap-2">
              <span
                className={`inline-block w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                  info!.on_squad === false ? "bg-destructive" : info!.on_squad === true ? "bg-success" : "bg-muted-foreground"
                }`}
                title={info!.on_squad === false ? "Not on current squad list" : info!.on_squad === true ? "On current squad list" : ""}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <span className="truncate">{player.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">({info!.country})</span>
                  {badge && (
                    <span className={`flex items-center gap-0.5 text-[11px] font-normal shrink-0 ${badge.color}`} title={match!.opponent ? `vs ${match!.opponent}` : undefined}>
                      <badge.Icon className="w-3.5 h-3.5" />
                      {badge.label}
                    </span>
                  )}
                </div>
                {item && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DataCard>
  );
}
