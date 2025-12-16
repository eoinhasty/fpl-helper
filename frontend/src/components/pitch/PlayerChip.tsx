// components/pitch/PlayerChip.tsx
import type { Player } from "../../lib/types";
import { CHIP } from "../../lib/constants";

const C_NEON = "#00FF87";
const PURPLE  = "#38003C";
const AMBER   = "#F59E0B";
const RED     = "#E11D48";

function CaptainBadge({ c, v }: { c?: boolean; v?: boolean }) {
  if (!c && !v) return null;
  return (
    <div
      className={`absolute -top-2 -left-2 h-6 w-6 grid place-items-center rounded-full ring-1 ring-black/10 shadow
                  text-[12px] font-bold ${c ? "bg-[--c]" : "bg-white text-[#666]"}`}
      style={{ ["--c" as any]: C_NEON, color: c ? "#074" : undefined }}
      title={c ? "Captain" : "Vice-captain"}
    >
      {c ? "C" : "V"}
    </div>
  );
}

function StatusTriangle({ cop }: { cop?: number }) {
  if (typeof cop !== "number" || cop === 100) return null;
  const fill = cop === 0 ? RED : AMBER;
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

function Points({ n }: { n?: number }) {
  if (typeof n !== "number") return null;
  return (
    <div className="absolute top-1 right-1 rounded-md bg-[#EDEDED] px-1.5 py-0.5 text-[11px] font-semibold text-[#222]">
      {n}
    </div>
  );
}

export default function PlayerChip({ p }: { p: Player }) {
  const cop = (p as any).chance_of_playing_next_round as number | undefined;

  return (
    <div className="relative select-none" title={`${p.name} (${p.team})`} style={{ pointerEvents: "auto", width: CHIP.WIDTH }}>
      <div className="transition-transform duration-150 hover:-translate-y-0.5">
        <div className="relative rounded-xl bg-white/90 shadow-[0_6px_16px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
          <Shirt url={p.shirt_url} />
          <Points n={(p as any).points} />
          <CaptainBadge c={p.is_captain} v={p.is_vice_captain} />
          <StatusTriangle cop={cop} />
          <div className="rounded-b-xl grid place-items-center text-white" style={{ backgroundColor: PURPLE, height: CHIP.BANNER_H }}>
            <div className="px-2 w-full flex items-center justify-center gap-1">
              <span className="truncate font-semibold leading-none" style={{ fontSize: CHIP.NAME_FS }}>{p.name}</span>
              {p.team && <span className="opacity-80 tracking-wide" style={{ fontSize: CHIP.TEAM_FS }}>{p.team}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}