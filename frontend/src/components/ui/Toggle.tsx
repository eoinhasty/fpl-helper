type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
};

export function Toggle({ checked, onChange, label }: Props) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full border border-border transition ${checked ? "border-transparent bg-primary" : "border-border bg-muted"} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full border border-border bg-card transition-transform ${checked ? "translate-x-5" : ""} `}
        />
      </button>
    </label>
  );
}

export default Toggle;
