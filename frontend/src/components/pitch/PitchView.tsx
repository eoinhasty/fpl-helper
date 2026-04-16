// components/pitch/PitchView.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import PitchSVG from "./PitchSVG";
import PlayerChip from "./PlayerChip";
import type { Player } from "../../lib/types";
import { type RowId, spreadXsSymmetric } from "../../lib/pitchLayout";
import { PITCH } from "../../lib/constants";
import BenchStrip from "./BenchStrip";

type Props = {
  players: Player[] | undefined;
  brand?: string;
  className?: string;
  onPlayerClick?: (p: Player) => void;
};

// SVG viewBox
const VB_W = 1417;
const VB_H = 788;

// Chip metrics (CSS px)
const CHIP_W_PX = 128;
const CHIP_MARGIN_PX = 14;

export default function PitchView({ players, brand = "YOUR BRAND", className, onPlayerClick }: Props) {
  const all = players ?? [];

  // XI is 1..11, bench is 12..15 (based on your existing slot usage)
  const xi = all.filter((p) => (p.slot ?? 99) <= 11);
  const benchPlayers = all
    .filter((p) => (p.slot ?? 99) >= 12 && (p.slot ?? 99) <= 15)
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));

  const gk = xi.filter((p) => p.position === 1);
  const def = xi.filter((p) => p.position === 2);
  const mid = xi.filter((p) => p.position === 3);
  const fwd = xi.filter((p) => p.position === 4);

  // Distribute field rows evenly across the pitch based on the actual formation.
  // This means a 5-4-1 and a 3-4-3 both space their rows proportionally rather
  // than using the same fixed Y values regardless of how many players are in each row.
  const fieldRows: Array<{ id: RowId; list: Player[] }> = [
    { id: "DEF", list: def },
    { id: "MID", list: mid },
    { id: "FWD", list: fwd },
  ].filter((r): r is { id: RowId; list: Player[] } => r.list.length > 0);

  const { TOP: Y_FIELD_TOP, BOT: Y_FIELD_BOT } = PITCH.FIELD_Y;
  const numField = fieldRows.length;

  const rows: Array<{ id: RowId; y: number; list: Player[] }> = [
    { id: "GK", y: PITCH.Y_GK, list: gk },
    ...fieldRows.map((r, i) => ({
      ...r,
      y: numField === 1
        ? (Y_FIELD_TOP + Y_FIELD_BOT) / 2
        : Y_FIELD_TOP + (Y_FIELD_BOT - Y_FIELD_TOP) * (i / (numField - 1)),
    })),
  ];

  // Bench labels like FPL: keeper + 1/2/3 subs
  const bench = useMemo(
    () => [
      { label: "GKP", player: benchPlayers[0] },
      { label: "1", player: benchPlayers[1] },
      { label: "2", player: benchPlayers[2] },
      { label: "3", player: benchPlayers[3] },
    ],
    [benchPlayers]
  );

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState<number | null>(null);

  useEffect(() => {
    if (!boxRef.current) return;
    const ro = new ResizeObserver((es) => {
      const w = es[0]?.contentRect.width;
      if (w) setBoxW(w);
    });
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  const pxToVB = useMemo(() => (boxW ? VB_W / boxW : 0), [boxW]);
  const chipGapVB = pxToVB ? (CHIP_W_PX + 2 * CHIP_MARGIN_PX) * pxToVB : 0;
  const gutterVB = pxToVB ? 6 * pxToVB : 8;

  return (
    <div className={`w-full select-none ${className ?? ""}`}>
      <div className={`relative overflow-hidden w-full`}>
        <div className="-mx-6 sm:-mx-8">
          <div className="relative w-full" style={{ aspectRatio: "1417 / 1200" }}>
            <div className="absolute inset-0"><PitchSVG brandLeft={brand} brandRight={brand} /></div>
            <div ref={boxRef} className="absolute inset-0">
              {rows.map(({ id, y, list }, rIdx) => {
                const xs = spreadXsSymmetric(list.length, id, VB_W, { chipGapVB, gutterVB }); // <—
                return list.map((p, i) => {
                  const x = xs[i] ?? VB_W / 2;
                  const leftPct = (x / VB_W) * 100;
                  const topPct = (y / VB_H) * 100;
                  return (
                    <div
                      key={`${rIdx}-${p.element}-${i}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    >
                      <div className="pointer-events-auto">
                        <PlayerChip p={p} onClick={() => onPlayerClick?.(p)} />
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bench band (visually attached to pitch) */}
      <div className="-mt-6 sm:-mt-8">
        <div className="rounded-b-2xl border-t border-border
                  bg-card/80 backdrop-blur-sm
                  shadow-[0_-6px_18px_rgba(0,0,0,0.05)]
                  overflow-hidden">
          {/* subtle fade from pitch -> band */}
          <div className="h-5 bg-gradient-to-b from-emerald-900/10 to-transparent" />

          <BenchStrip bench={bench} onPlayerClick={onPlayerClick} />
        </div>
      </div>
    </div>
  );
}