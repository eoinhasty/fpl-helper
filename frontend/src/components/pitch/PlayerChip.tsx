// components/pitch/PlayerChip.tsx
import type { Player } from "../../lib/types";
import { CHIP } from "../../lib/constants";

const PURPLE = "#38003C";
const AMBER = "#F59E0B";
const RED = "#E11D48";

const ROLE_TEXT = "#fcfcfc";  // light text for contrast on PURPLE

function CaptainBadge({ c, v }: { c?: boolean; v?: boolean }) {
  if (!c && !v) return null;

  const label = c ? "C" : "V";

  return (
    <div
      className="absolute -top-2 -left-2 h-5 w-5 grid place-items-center
                 rounded-full shadow ring-1 ring-black/15 text-[11px] font-bold"
      style={{ backgroundColor: PURPLE, color: ROLE_TEXT }}
      title={c ? "Captain" : "Vice-captain"}
    >
      {label}
    </div>
  );
}

function StatusTriangle({ status }: { status?: string }) {
  if (!status || status === "a") return null;

  const fill = status === "d" ? AMBER : RED; // d=knock-ish, i/s/n = red
  return (
    <div className="absolute -bottom-1 -right-1">
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
        <path d="M0 20 L20 20 L20 0 Z" fill={fill} />
      </svg>
    </div>
  );
}

function Shirt({ url }: { url?: string | null }) {
  if (!url) return <div className="h-10" />; // keep spacer height if no image
  return (
    <>
      <div
        className="absolute -top-7 left-1/2 -translate-x-1/2"
        style={{ width: CHIP.SHIRT_BOX, height: CHIP.SHIRT_BOX }}
      >
        <div className="h-full w-full rounded-lg bg-white/95 ring-1 ring-black/5 shadow-md grid place-items-center">
          <img src={url} alt="" className="object-contain" style={{ width: CHIP.SHIRT_IMG, height: CHIP.SHIRT_IMG }} loading="lazy" />
        </div>
      </div>
      <div className="h-10" />
    </>
  );
}

function Points({
  n,
  variant = "xi",
  isCaptain = false,
  title,
}: {
  n?: number;
  variant?: "xi" | "bench";
  isCaptain?: boolean;
  title?: string;
}) {
  if (typeof n !== "number") return null;

  const base =
    "absolute top-1 right-1 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums rounded-md";

  const styles =
    variant === "bench"
      ? "bg-muted text-muted-foreground opacity-70"
      : isCaptain
        ? "bg-warning/15 text-warning ring-1 ring-warning shadow-sm"
        : "bg-muted text-foreground shadow-sm";

  return (
    <div className={`${base} ${styles}`} title={title}>
      {n}
    </div>
  );
}

function StartProbBar({ probability }: { probability?: number | null }) {
  if (probability == null) return null;
  const pct = Math.round(probability * 100);
  const fill = probability >= 0.7 ? "#22c55e" : probability >= 0.4 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center justify-center gap-1 mt-1">
      <div className="w-9 h-[3px] rounded-full overflow-hidden bg-muted">
        <div style={{ width: `${pct}%`, height: "100%", background: fill, borderRadius: 2 }} />
      </div>
      <span className="text-muted-foreground" style={{ fontSize: 9, fontVariantNumeric: "tabular-nums" }}>
        {pct}%
      </span>
    </div>
  );
}

function BenchOrderBadge({ label }: { label: string }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -bottom-5
                 text-[10px] font-semibold px-2 py-0.5 rounded-full
                 bg-muted text-muted-foreground ring-1 ring-border"
    >
      {label}
    </div>
  );
}


export default function PlayerChip({ p, onClick }: { p: Player; onClick?: () => void }) {
  const isBench = (p.slot ?? 99) >= 12 || (p.multiplier ?? 1) === 0;

  const benchLabel =
    (p.slot ?? 0) === 12 ? "GKP"
      : (p.slot ?? 0) === 13 ? "1"
        : (p.slot ?? 0) === 14 ? "2"
          : (p.slot ?? 0) === 15 ? "3"
            : undefined;

  const displayPoints =
    p.gw_points == null
      ? undefined
      : isBench
        ? p.gw_points
        : p.gw_points * (p.multiplier ?? 1);

  const tooltip =
    p.gw_points == null
      ? undefined
      : isBench
        ? `Bench: ${p.gw_points} points (not counted)`
        : p.is_captain
          ? `Captain: ${p.gw_points} × 2 = ${displayPoints}`
          : `GW points: ${displayPoints}`;

  return (
    <div
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <div className="relative select-none" title={`${p.name} (${p.team})`} style={{ pointerEvents: "auto", width: CHIP.WIDTH }}>
        <div className="transition-transform duration-150 hover:-translate-y-0.5">
          <div className="relative rounded-xl bg-white/90 shadow-[0_6px_16px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
            <Shirt url={p.shirt_url} />
            <Points
              n={displayPoints}
              variant={isBench ? "bench" : "xi"}
              isCaptain={!!p.is_captain}
              title={tooltip}
            />
            <CaptainBadge c={p.is_captain} v={p.is_vice_captain} />
            <StatusTriangle status={p.status} />

            {isBench && benchLabel && <BenchOrderBadge label={benchLabel} />}

            <div className="rounded-b-xl grid place-items-center text-white" style={{ backgroundColor: PURPLE, height: CHIP.BANNER_H }}>
              <div className="px-2 w-full flex items-center justify-center gap-1">
                <span className="font-semibold leading-none" style={{ fontSize: CHIP.NAME_FS }}>{p.name}</span>
                {p.team && <span className="opacity-80 tracking-wide" style={{ fontSize: CHIP.TEAM_FS }}>{p.team}</span>}
              </div>
            </div>
          </div>
          {!isBench && <StartProbBar probability={p.start_probability} />}
        </div>
      </div>
    </div>
  );
}