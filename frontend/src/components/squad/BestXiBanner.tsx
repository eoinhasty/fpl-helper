import type { LineupSuggestion } from "../../lib/lineup";
import ConfidenceTag from "../ui/ConfidenceTag";

const names = (ps: { name: string }[]) => ps.map((p) => p.name).join(", ");

/** One-line Best XI nudge above the squad view; hidden when the lineup is already best. */
export default function BestXiBanner({
  suggestion: s,
  previewing,
  onTogglePreview,
}: {
  suggestion: LineupSuggestion | null;
  previewing: boolean;
  onTogglePreview: () => void;
}) {
  if (!s || (s.bringIn.length === 0 && !s.benchChanged)) return null;
  const unit = s.projected ? "proj pts" : "xPts";

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-3 py-2">
      <div className="min-w-0 text-sm text-foreground">
        <span className="font-semibold">Best XI</span>
        {s.gain > 0 && (
          <span className="ml-1.5 font-semibold text-success">
            +{s.gain.toFixed(1)} {unit}
            {/* Measured on single swaps on the model's projections; a multi-player
                gain sums several noisy swaps, and FPL's xPts wasn't measured */}
            {s.projected && s.bringIn.length === 1 && <ConfidenceTag gap={s.gain} gws={1} />}
          </span>
        )}
        <span className="text-muted-foreground">
          {" — "}
          {s.bringIn.length > 0
            ? <>start {names(s.bringIn)} for {names(s.drop)}{s.formation !== s.currentFormation && <> ({s.formation})</>}</>
            : <>reorder your bench: {names(s.bench.slice(1))}</>}
        </span>
      </div>
      <button
        type="button"
        onClick={onTogglePreview}
        aria-pressed={previewing}
        className={`${previewing ? "btn" : "btn-primary rounded-lg px-3 py-1.5 text-sm font-medium"} shrink-0 cursor-pointer`}
      >
        {previewing ? "Show my XI" : "Preview"}
      </button>
    </div>
  );
}
