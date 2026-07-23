// components/controls/GwSelect.tsx
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";

export function GwSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel = "Select gameweek",
}: {
  value: number | undefined;
  options: number[];
  onChange: (gw: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Listbox value={value ?? null} onChange={onChange} disabled={disabled}>
      <div className="relative">
        <ListboxButton
          aria-label={ariaLabel}
          className={[
            "flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-foreground",
            "transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
            disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/60",
          ].join(" ")}
        >
          <span>{value != null ? `GW ${value}` : "GW —"}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className="text-muted-foreground"
          >
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ListboxButton>
        <ListboxOptions
          anchor="bottom end"
          transition
          className={[
            "z-40 mt-1 max-h-64 w-28 overflow-auto rounded-xl border border-border bg-card p-1 shadow-lg",
            "focus:outline-none",
            "transition duration-100 ease-out data-[closed]:opacity-0 data-[closed]:scale-95",
          ].join(" ")}
        >
          {options.map((g) => (
            <ListboxOption
              key={g}
              value={g}
              className={({ focus, selected }) =>
                [
                  "cursor-pointer select-none rounded-lg px-3 py-1.5 text-sm",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : focus
                      ? "bg-muted/60 text-foreground"
                      : "text-muted-foreground",
                ].join(" ")
              }
            >
              GW {g}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

export default GwSelect;
