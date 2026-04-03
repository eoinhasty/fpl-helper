// components/pitch/BenchStrip.tsx
import type { Player } from "../../lib/types";
import PlayerChip from "./PlayerChip";

type BenchSlot = { label: string; player?: Player };

export default function BenchStrip({
    bench,
    onPlayerClick,
}: {
    bench: BenchSlot[];
    onPlayerClick?: (p: Player) => void;
}) {
    return (
        <div className="w-full flex justify-center">
            <div className="w-[min(760px,96vw)] px-3 py-3">
                <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-foreground">
                        Bench <span className="text-muted-foreground font-medium">• Auto-sub priority</span>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                    {bench.map((slot, idx) => (
                        <div key={idx} className="flex flex-col items-center">
                            <div className="w-full flex justify-center min-h-[128px] items-end pb-4">
                                {slot.player ? (
                                    <div className="relative">
                                        <PlayerChip
                                            p={slot.player}
                                            onClick={() => onPlayerClick?.(slot.player!)}
                                        />
                                    </div>
                                ) : (
                                    <div className="h-[74px] w-[92px] rounded-lg bg-muted ring-1 ring-border" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}