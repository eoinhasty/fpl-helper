// components/controls/Segmented.tsx
import * as React from "react";

export type Option<T extends string> = {
  label: string;
  value: T;
  disabled?: boolean;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = "",
  fullWidth = false,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
  /** Stretch buttons to fill container (equal widths) */
  fullWidth?: boolean;
  /** Optional aria-label for the radiogroup */
  ariaLabel?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  // Keyboard navigation: ← → Home End
  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir =
      e.key === "ArrowRight" ? 1 :
      e.key === "ArrowLeft"  ? -1 : 0;

    if (dir !== 0) {
      e.preventDefault();
      let j = idx;
      // move to next non-disabled option
      for (let step = 0; step < options.length; step++) {
        j = (j + dir + options.length) % options.length;
        if (!options[j].disabled) {
          onChange(options[j].value);
          break;
        }
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = options.find((o) => !o.disabled);
      if (first) onChange(first.value);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = [...options].reverse().find((o) => !o.disabled);
      if (last) onChange(last.value as T);
    }
  };

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={[
        "inline-flex rounded-2xl border border-border p-1 bg-card",
        className,
        fullWidth && "w-full",
      ].filter(Boolean).join(" ")}
      onKeyDown={onKeyDown}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const common =
          "px-3 py-1.5 rounded-xl text-sm transition focus:outline-none " +
          "focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background";

        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            aria-disabled={opt.disabled || undefined}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={[
              common,
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60",
              fullWidth && "flex-1",
              opt.disabled && "opacity-50 cursor-not-allowed",
            ].filter(Boolean).join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;