// components/pitch/PitchView.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import PitchSVG from "./PitchSVG";
import PlayerChip from "./PlayerChip";
import type { Player } from "../../lib/types";
import { ROW_Y, type RowId, spreadXsSymmetric } from "../../lib/pitchLayout"; // <—

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
  const xi = (players ?? []).filter((p) => (p.slot ?? 99) <= 11);
  const gk  = xi.filter((p) => p.position === 1);
  const def = xi.filter((p) => p.position === 2);
  const mid = xi.filter((p) => p.position === 3);
  const fwd = xi.filter((p) => p.position === 4);

  const rows: Array<{ id: RowId; y: number; list: Player[] }> = [
    { id: "GK",  y: ROW_Y.GK,  list: gk  },
    { id: "DEF", y: ROW_Y.DEF, list: def },
    { id: "MID", y: ROW_Y.MID, list: mid },
    { id: "FWD", y: ROW_Y.FWD, list: fwd },
  ];

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
  const gutterVB  = pxToVB ? 6 * pxToVB : 8;

  return (
    <div className={`relative overflow-hidden w-full select-none ${className ?? ""}`}>
      <div className="-mx-6 sm:-mx-8">
        <div className="relative w-full" style={{ aspectRatio: "1417 / 1200" }}>
          <div className="absolute inset-0"><PitchSVG brandLeft={brand} brandRight={brand} /></div>
          <div ref={boxRef} className="absolute inset-0">
            {rows.map(({ id, y, list }, rIdx) => {
              const xs = spreadXsSymmetric(list.length, id, VB_W, { chipGapVB, gutterVB }); // <—
              return list.map((p, i) => {
                const x = xs[i] ?? VB_W / 2;
                const leftPct = (x / VB_W) * 100;
                const topPct  = (y / VB_H) * 100;
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
  );
}