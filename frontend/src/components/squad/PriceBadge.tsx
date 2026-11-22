import type { PriceOutlook } from "../../lib/types";
import { PRICE_COPY, TONE_CLASS } from "../../lib/utils";

/** "Likely rise/fall" pill — only for FPL's top band, so most players show nothing. */
export default function PriceBadge({ outlook }: { outlook: PriceOutlook | null | undefined }) {
  if (!outlook?.likely) return null;
  const copy = PRICE_COPY[outlook.likely];
  const t = TONE_CLASS[copy.tone];
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap ${t.soft} ${t.text}`}
      title={copy.outlook}
    >
      <span aria-hidden="true">{outlook.likely === "rise" ? "↑" : "↓"}</span> {copy.label}
    </span>
  );
}
