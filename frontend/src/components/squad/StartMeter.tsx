import React from "react";

interface StartMeterProps {
    probability: number; // 0 → 1
}

export const StartMeter: React.FC<StartMeterProps> = ({ probability }) => {
    const pct = Math.round((probability || 0) * 100);
    const safePct = Math.min(Math.max(pct, 0), 99);

    const color =
        pct >= 75 ? "bg-accent" : pct >= 60 ? "bg-warn" : "bg-danger";

    return (
        // Full-featured version with % label:
        // <div className="relative w-full h-4 bg-gray-200 rounded-md overflow-hidden">
        //   <div className={`h-full ${color} relative`} style={{ width: `${safePct}%` }}>
        //     {pct >= 15 && (
        //       <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs font-semibold text-white drop-shadow">
        //         {pct}%
        //       </span>
        //     )}
        //   </div>
        //   {pct < 15 && (
        //     <span className="absolute left-[calc(100%+0.25rem)] top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-600">
        //       {pct}%
        //     </span>
        //   )}
        // </div>

        // Minimal tokenised bar:
        <div className="h-2 rounded-full border border-border"
             style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
            <div className="h-full rounded-full"
                 style={{
                     width: `${pct}%`,
                     background: pct >= 80 ? 'var(--success)' :
                                 pct >= 60 ? 'var(--warning)' : 'var(--danger)'
                 }} />
        </div>
    );
};

export default StartMeter;