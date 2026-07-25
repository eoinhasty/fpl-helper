// components/controls/SelectMenu.tsx
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";

export function SelectMenu<T>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  disabled = false,
  placeholder = "",
  anchor = "bottom start",
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  anchor?: "bottom start" | "bottom end";
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className}`}>
        <ListboxButton
          aria-label={ariaLabel}
          className={[
            "flex h-9 w-full items-center justify-between gap-1.5 rounded-xl border border-border bg-card px-3 text-sm text-foreground",
            "transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
            disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/60",
          ].join(" ")}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className="text-muted-foreground shrink-0"
          >
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ListboxButton>
        <ListboxOptions
          anchor={anchor}
          transition
          className={[
            "z-40 mt-1 max-h-64 w-[var(--button-width)] overflow-auto rounded-xl border border-border bg-card p-1 shadow-lg",
            "focus:outline-none",
            "transition duration-100 ease-out data-[closed]:opacity-0 data-[closed]:scale-95",
          ].join(" ")}
        >
          {options.map((o) => (
            <ListboxOption
              key={String(o.value)}
              value={o.value}
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
              {o.label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

export default SelectMenu;
