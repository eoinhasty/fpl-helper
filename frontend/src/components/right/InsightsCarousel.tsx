import * as React from "react";
import Card from "../ui/Card";
import type { Player } from "../../lib/types";

type SlideKey = "captaincy" | "health" | "market";

const SLIDES: SlideKey[] = ["captaincy", "health", "market"];

export default function InsightsCarousel({ players }: { players?: Player[] | null }) {
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
        {key === "captaincy" && <CaptaincySlide players={players || []} />}
        {key === "health" && <HealthSlide players={players || []} />}
        {key === "market" && <MarketStub />}
      </div>
    </Card>
  );
}

/* ---------- Slides ---------- */

function CaptaincySlide({ players }: { players: Player[] }) {
  // XI only
  const xi = players.filter((p) => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11);

  // score: start% * exponential FDR weight + home boost + rolling form + ICT signal
  const scored = xi
    .map((p) => {
      const sp = (p.start_probability ?? 0) * 100;
      const fdr = p.fixture?.difficulty ?? 3;
      const home = p.fixture?.home ? 4 : 0;
      const form = parseFloat(p.form ?? "0");          // rolling avg last 3 GWs
      const ict = parseFloat(p.ict_index ?? "0") / 10; // attacking threat signal
      const fdrPenalty = Math.pow(2, fdr - 1);         // FDR1=1, FDR2=2, FDR3=4, FDR4=8, FDR5=16
      const score = sp * (10 / fdrPenalty) + home + form * 2 + ict;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) return <Empty text="No XI loaded yet." />;

  return (
    <ul className="space-y-2">
      {scored.map(({ p, score }, i) => (
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
                {p.fixture
                  ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp} • FDR ${p.fixture.difficulty}`
                  : "No fixture"}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            start {Math.round((p.start_probability ?? 0) * 100)}%
            <div className="font-semibold text-foreground">{Math.round(score)}</div>
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