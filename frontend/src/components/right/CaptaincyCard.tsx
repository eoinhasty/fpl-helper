import Card from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import type { Player } from "../../lib/types";
import { isStarting } from "../../lib/utils";

function norm(v: number, arr: number[]) {
  const mn = Math.min(...arr), mx = Math.max(...arr);
  return mx === mn ? 0.5 : (v - mn) / (mx - mn);
}

const posMult = (pos?: number) => pos === 4 ? 1.0 : pos === 3 ? 0.92 : 0.72;

function score(players: Player[]) {
  const xi = players.filter((p) => isStarting(p) && p.position !== 1);

  const raw = xi.map((p) => {
    const fxs = p.fixtures ?? (p.fixture ? [p.fixture] : []);
    const avgFdr = fxs.length ? fxs.reduce((s, f) => s + f.difficulty, 0) / fxs.length : 3;
    const homeRatio = fxs.length ? fxs.filter((f) => f.home).length / fxs.length : 0;
    const ep = parseFloat(p.ep_next ?? "0");
    return {
      p,
      form: parseFloat(p.form ?? "0"),
      ict: parseFloat(p.ict_index ?? "0"),
      ep,
      epDisplay: fxs.length > 1 && ep > 0 ? ep * fxs.length : ep,
      fdr: avgFdr,
      home: homeRatio,
      sp: p.start_probability ?? 0,
      dgw: fxs.length > 1,
      bgw: fxs.length === 0,
    };
  });

  const forms = raw.map((r) => r.form);
  const icts = raw.map((r) => r.ict);
  const epDisplays = raw.map((r) => r.epDisplay);
  const hasEp = epDisplays.some((e) => e > 0);

  return raw
    .map((r) => {
      const base = hasEp ? norm(r.epDisplay, epDisplays) : norm(r.form, forms) * 0.5 + norm(r.ict, icts) * 0.5;
      const fdrFactor = 1 - (r.fdr - 1) / 4;
      const homeBoost = 1 + r.home * 0.08;
      const dgwBoost = r.dgw ? 1.8 : 1.0;
      const bgwPenalty = r.bgw ? 0.1 : 1.0;
      const s = base * fdrFactor * homeBoost * dgwBoost * bgwPenalty * r.sp * posMult(r.p.position);
      return { p: r.p, score: s, epDisplay: r.epDisplay };
    })
    .sort((a, b) => b.score - a.score);
}

const DIFF_THRESHOLD = 15;

const RANK_ICON = ["⭐", "🥈", "🥉"];

function PlayerRow({
  p,
  epDisplay,
  rank,
  onPlayerClick,
}: {
  p: import("../../lib/types").Player;
  epDisplay: number;
  rank?: number;
  onPlayerClick?: (p: import("../../lib/types").Player) => void;
}) {
  const fxs = p.fixtures ?? (p.fixture ? [p.fixture] : []);
  return (
    <li
      onClick={() => onPlayerClick?.(p)}
      className={`flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5${onPlayerClick ? " cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <img
          src={p.shirt_url || ""}
          alt=""
          className="w-6 h-6 rounded border border-border bg-card object-contain"
        />
        <div className="truncate">
          <div className="text-sm font-medium text-foreground truncate">
            {rank !== undefined ? `${RANK_ICON[rank]} ` : "💡 "}{p.name}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {p.team} •{" "}
            {p.has_dgw && fxs.length > 0
              ? fxs.map((f) => `${f.home ? "vs" : "@"} ${f.opp}`).join(", ") + " • DGW"
              : p.fixture
                ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp} • FDR ${p.fixture.difficulty}`
                : "BGW"}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground text-right shrink-0">
        {typeof p.selected_by_percent !== "undefined" && (
          <div>{Number(p.selected_by_percent).toFixed(1)}% own</div>
        )}
        <div className="font-semibold text-foreground">
          {epDisplay > 0
            ? `${epDisplay.toFixed(1)} xPts`
            : `${parseFloat(p.form ?? "0").toFixed(1)} form`}
        </div>
      </div>
    </li>
  );
}

function CaptaincySkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
          <Skeleton className="w-6 h-6 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function CaptaincyCard({
  entry,
  players,
  loading,
  error,
  isHistorical,
  onPlayerClick,
}: {
  entry?: number | "";
  players?: Player[] | null;
  loading?: boolean;
  error?: string | null;
  isHistorical?: boolean;
  onPlayerClick?: (p: Player) => void;
}) {
  if (isHistorical) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground mb-2">Captaincy Picks</div>
        <div className="text-sm text-muted-foreground">Captain picks use live data — not available for past GWs.</div>
      </Card>
    );
  }

  if (!entry) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground mb-2">Captaincy Picks</div>
        <div className="text-sm text-muted-foreground">Set your entry id to see captain picks.</div>
      </Card>
    );
  }

  if (loading && !players) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground mb-2">Captaincy Picks</div>
        <CaptaincySkeleton />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground mb-2">Captaincy Picks</div>
        <div className="text-sm text-destructive">{error}</div>
      </Card>
    );
  }

  const all = players ? score(players) : [];
  const picks = all.slice(0, 3);
  const topIds = new Set(picks.map((r) => r.p.element));
  const differential = all.find(
    (r) =>
      !topIds.has(r.p.element) &&
      typeof r.p.selected_by_percent !== "undefined" &&
      Number(r.p.selected_by_percent) < DIFF_THRESHOLD
  ) ?? null;

  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-foreground mb-2">Captaincy Picks</div>
      {picks.length === 0 ? (
        <div className="text-sm text-muted-foreground">Captain picks appear once your squad is loaded.</div>
      ) : (
        <>
          <ul className="space-y-2">
            {picks.map(({ p, epDisplay }, i) => (
              <PlayerRow key={p.element} p={p} epDisplay={epDisplay} rank={i} onPlayerClick={onPlayerClick} />
            ))}
          </ul>

          {differential && (
            <>
              <div className="mt-3 mb-2 border-t border-border" />
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Differential</div>
              <ul>
                <PlayerRow p={differential.p} epDisplay={differential.epDisplay} onPlayerClick={onPlayerClick} />
              </ul>
            </>
          )}
        </>
      )}
    </Card>
  );
}
