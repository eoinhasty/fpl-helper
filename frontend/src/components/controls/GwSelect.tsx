// components/controls/GwSelect.tsx
import { SelectMenu } from "./SelectMenu";

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
    <SelectMenu<number | undefined>
      value={value}
      onChange={(gw) => gw != null && onChange(gw)}
      disabled={disabled}
      ariaLabel={ariaLabel}
      className="w-28"
      anchor="bottom end"
      placeholder="GW —"
      options={options.map((g) => ({ label: `GW ${g}`, value: g }))}
    />
  );
}

export default GwSelect;
