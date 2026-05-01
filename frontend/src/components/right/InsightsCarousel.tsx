import * as React from "react";
import Card from "../ui/Card";
import type { Player } from "../../lib/types";

type SlideKey = "captaincy" | "health" | "market";

const SLIDES: SlideKey[] = ["captaincy", "health", "market"];

export default function InsightsCarousel({ players, isHistorical }: { players?: Player[] | null; isHistorical?: boolean }) {
  const [idx, setIdx] = React.useState(0);
  const key = SLIDES[idx];

  // auto-advance, pause on hover
  const [hover, setHover] = React.useState(false);
  React.useEffect(() => {
    if (hover) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 8000);
    return () => clearInterval(id);
  }, [hover]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-foreground">
          {key === "captaincy"
            ? "Captaincy Picks"
            : key === "health"
            ? "Team Health"
            : "Market Trends"}
        </div>
        <div className="flex items-center gap-1">
          {SLIDES.map((s, i) => (
            <button
              key={s}
              onClick={() => setIdx(i)}
              className={`w-2.5 h-2.5 rounded-full transition
                ${i === idx ? "bg-foreground" : "bg-muted"}
                focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
              `}
              aria-label={`Go to ${s}`}
            />
          ))}
        </div>
      </div>

      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {key === "captaincy" && (
          isHistorical
            ? <Empty text="Captain picks use live data — not available for past GWs." />
            : <CaptaincySlide players={players || []} />
        )}
        {key === "health" && <HealthSlide players={players || []} />}
        {key === "market" && <MarketStub />}
      </div>
    </Card>
  );
}

/* ---------- Slides ---------- */

function CaptaincySlide({ players }: { players: Player[] }) {
  // XI only, exclude GKs (never captain candidates)
  const xi = players.filter(
    (p) => ((p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11) && p.position !== 1
  );

  const norm = (v: number, arr: number[]) => {
    const mn = Math.min(...arr), mx = Math.max(...arr);
    return mx === mn ? 0.5 : (v - mn) / (mx - mn);
  };

  // position multiplier: FWD > MID > DEF — GKs already excluded above
  const posMult = (pos?: number) => pos === 4 ? 1.0 : pos === 3 ? 0.92 : 0.72;

  const raw = xi.map((p) => {
    const fxs = p.fixtures ?? (p.fixture ? [p.fixture] : []);
    const avgFdr = fxs.length
      ? fxs.reduce((s, f) => s + f.difficulty, 0) / fxs.length
      : 3;
    const homeRatio = fxs.length
      ? fxs.filter((f) => f.home).length / fxs.length
      : 0;
    const ep = parseFloat(p.ep_next ?? "0");
    return {
      p,
      form: parseFloat(p.form ?? "0"),
      ict:  parseFloat(p.ict_index ?? "0"),
      ep,
      epDisplay: fxs.length > 1 && ep > 0 ? ep * fxs.length : ep,
      fdr:  avgFdr,
      home: homeRatio,
      sp:   p.start_probability ?? 0,
      dgw:  fxs.length > 1,
      bgw:  fxs.length === 0,
    };
  });

  const forms      = raw.map((r) => r.form);
  const icts       = raw.map((r) => r.ict);
  const epDisplays = raw.map((r) => r.epDisplay);
  const hasEp      = epDisplays.some((e) => e > 0);

  const scored = raw
    .map((r) => {
      const normForm  = norm(r.form, forms);
      const normIct   = norm(r.ict, icts);
      const normEp    = norm(r.epDisplay, epDisplays);
      const base      = hasEp ? normEp : normForm * 0.5 + normIct * 0.5;
      const fdrFactor = 1 - (r.fdr - 1) / 4;    // linear avg: FDR1=1.0 … FDR5=0.0
      const homeBoost = 1 + r.home * 0.08;        // ratio of home fixtures × 8%
      const dgwBoost  = r.dgw ? 1.8 : 1.0;        // two fixtures ≈ 1.8× expected output
      const bgwPenalty = r.bgw ? 0.1 : 1.0;       // no fixture this GW — strongly demote
      const score     = base * fdrFactor * homeBoost * dgwBoost * bgwPenalty * r.sp * posMult(r.p.position);
      return { p: r.p, score, epDisplay: r.epDisplay };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) return <Empty text="No XI loaded yet." />;

  return (
    <ul className="space-y-2">
      {scored.map(({ p, epDisplay }, i) => (
        <li
          key={p.element}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={p.shirt_url || ""}
              alt=""
              className="w-6 h-6 rounded border border-border bg-card object-contain"
            />
            <div className="truncate">
              <div className="text-sm font-medium text-foreground truncate">
                {i === 0 ? "⭐ " : i === 1 ? "🥈 " : "🥉 "}
                {p.name}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {p.team} •{" "}
                {p.has_dgw && p.fixtures
                  ? p.fixtures.map((f) => `${f.home ? "vs" : "@"} ${f.opp}`).join(", ") + " • DGW"
                  : p.fixture
                    ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp} • FDR ${p.fixture.difficulty}`
                    : "BGW"}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            start {Math.round((p.start_probability ?? 0) * 100)}%
            <div className="font-semibold text-foreground">
              {epDisplay > 0
                ? `${epDisplay.toFixed(1)} xPts`
                : `${parseFloat(p.form ?? "0").toFixed(1)} form`}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function HealthSlide({ players }: { players: Player[] }) {
  const flagged = players.filter(
    (p) =>
      (p.status && p.status !== "a") ||
      (p.start_probability ?? 0) < 0.6 ||
      (p.news || "").toLowerCase().match(/injur|doubt|knock|hamstring|illness|setback/)
  );

  const lowStart = players
    .filter((p) => (p.start_probability ?? 0) < 0.6)
    .sort((a, b) => (a.start_probability ?? 0) - (b.start_probability ?? 0))
    .slice(0, 4);

  if (players.length === 0) return <Empty text="No squad yet." />;

  return (
    <div className="space-y-3">
      <div className="text-sm text-foreground">
        <span className="font-semibold">{flagged.length}</span> at risk
        <span className="text-muted-foreground"> • under 60% start or flagged</span>
      </div>
      {lowStart.length > 0 && (
        <ul className="space-y-1">
          {lowStart.map((p) => (
            <li
              key={p.element}
              className="text-sm flex items-center justify-between rounded-md border border-border bg-card px-2 py-1"
            >
              <span className="truncate text-foreground">
                {p.name}{" "}
                <span className="text-xs text-muted-foreground">({p.team})</span>
              </span>
              <span className="text-xs text-destructive font-medium">
                {Math.round((p.start_probability ?? 0) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MarketStub() {
  return (
    <div className="text-sm text-foreground">
      Connect to market data:
      <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
        <li>Top transfers in/out (GW)</li>
        <li>Ownership vs you</li>
        <li>Watchlist</li>
      </ul>
      <div className="text-[11px] text-muted-foreground mt-2">
        (Hook to <code>bootstrap</code> transfers fields or add <code>/api/market</code> later.)
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground">{text}</div>;
}