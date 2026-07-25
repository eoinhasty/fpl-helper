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
        className={`w-10 h-6 rounded-full border border-border relative transition
          ${checked ? "bg-primary border-transparent" : "bg-muted border-border"}
          focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
        `}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card border border-border transition-transform
            ${checked ? "translate-x-4" : ""}
          `}
        />
      </button>
    </label>
  );
}

export default Toggle;
