// components/controls/GwSelect.tsx
import { SelectMenu, type SelectMenuVariant } from "./SelectMenu";

export function GwSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel = "Select gameweek",
  className = "w-28",
  variant = "default",
}: {
  value: number | undefined;
  options: number[];
  onChange: (gw: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  variant?: SelectMenuVariant;
}) {
  return (
    <SelectMenu<number | null>
      value={value ?? null}
      onChange={(gw) => gw != null && onChange(gw)}
      disabled={disabled}
      ariaLabel={ariaLabel}
      className={className}
      variant={variant}
      anchor="bottom end"
      placeholder="GW —"
      options={options.map((g) => ({ label: `GW ${g}`, value: g }))}
    />
  );
}

export default GwSelect;
