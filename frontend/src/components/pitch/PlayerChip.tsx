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

export default function PlayerChip({ p, onClick }: { p: Player; onClick?: () => void }) {
  const cop = (p as any).chance_of_playing_next_round as number | undefined;

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
            <Points n={(p as any).points} />
            <CaptainBadge c={p.is_captain} v={p.is_vice_captain} />
            <StatusTriangle cop={cop} />
            <div className="rounded-b-xl grid place-items-center text-white" style={{ backgroundColor: PURPLE, height: CHIP.BANNER_H }}>
              <div className="px-2 w-full flex items-center justify-center gap-1">
                <span className="font-semibold leading-none" style={{ fontSize: CHIP.NAME_FS }}>{p.name}</span>
                {p.team && <span className="opacity-80 tracking-wide" style={{ fontSize: CHIP.TEAM_FS }}>{p.team}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}