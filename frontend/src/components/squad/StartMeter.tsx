interface StartMeterProps {
  probability: number; // 0 → 1
  showLabel?: boolean;
  className?: string;
}

export default function StartMeter({ probability, showLabel = false, className }: StartMeterProps) {
  const pct = Math.round((probability ?? 0) * 100);
  const fillClass =
    probability >= 0.7 ? "bg-success" :
    probability >= 0.4 ? "bg-warning" :
    "bg-destructive";

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <div className="flex-1 h-[3px] rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <span className="text-muted-foreground tabular-nums" style={{ fontSize: 9 }}>
          {pct}%
        </span>
      )}
    </div>
  );
}
