// right/InternationalDutyCard.tsx

import DataCard from "../ui/DataCard";
import { useFetch } from "../../hooks/useFetch";
import { fmtRelTime } from "../../lib/format";
import type { Player } from "../../lib/types";
import PlayerOpen from "../squad/PlayerOpen";
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
type PlayerNews = {
  country: string | null;
  on_squad: boolean | null;
  news: NewsItem[];
  recent_match: RecentMatch | null;
};
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
          const squadLabel =
            info!.on_squad === false
              ? "Not on current squad list"
              : info!.on_squad === true
                ? "On current squad list"
                : undefined;
          return (
            <div key={player.element} className="flex items-start gap-2">
              <span
                className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                  info!.on_squad === false
                    ? "bg-destructive"
                    : info!.on_squad === true
                      ? "bg-success"
                      : "bg-muted-foreground"
                }`}
                title={squadLabel}
                role={squadLabel ? "img" : undefined}
                aria-label={squadLabel}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <PlayerOpen id={player.element} inline className="truncate">
                    {player.name}
                  </PlayerOpen>
                  {info!.country && <span className="shrink-0 text-xs text-muted-foreground">({info!.country})</span>}
                  {badge && (
                    <span
                      className={`flex shrink-0 items-center gap-0.5 text-[11px] font-normal ${badge.color}`}
                      title={match!.opponent ? `vs ${match!.opponent}` : undefined}
                    >
                      <badge.Icon className="h-3.5 w-3.5" />
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
                        className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {item.headline}
                      </a>
                    ) : (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.headline}</div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtRelTime(item.published)}</div>
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
