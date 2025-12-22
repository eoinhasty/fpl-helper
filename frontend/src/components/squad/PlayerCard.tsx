import type { Player } from "../../lib/types";
import { fmtPrice } from "../../lib/format";
import StartMeter from "./StartMeter";
import FixturePill from "./FixturePill";

export default function PlayerCard({
  p,
  benchBadge,
  onOpen,
}: {
  p: Player;
  benchBadge?: string | null;
  onOpen: () => void;
}) {
  const cap = p.is_captain ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
      C
    </span>
  ) : p.is_vice_captain ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
      VC
    </span>
  ) : benchBadge ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
      {benchBadge}
    </span>
  ) : null;

  return (
    <>
      <div
        onClick={onOpen}
        className="rounded-xl p-3 cursor-pointer transition bg-card border border-border hover:shadow-card"
        title="Click for details"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <img
              src={p.shirt_url || ""}
              alt={`${p.team} shirt`}
              className="w-10 h-10 object-contain rounded-md border border-border bg-card p-0.5"
            />
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate text-foreground">
                {p.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.team} • {fmtPrice(p.price)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {cap}
            <FixturePill f={p.fixture ?? undefined} />
          </div>
        </div>

        <div className="mt-2">
          <StartMeter probability={p.start_probability} />
        </div>

        {p.news ? (
          <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {p.news}
          </div>
        ) : null}
      </div>
    </>
  );
}
