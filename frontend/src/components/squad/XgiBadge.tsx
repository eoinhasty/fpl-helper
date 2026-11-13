import type { XgiSignal } from "../../lib/types";
import { TONE_CLASS, XGI_COPY, xgiSummary } from "../../lib/utils";

export default function XgiBadge({
  signal,
  ga,
  xgi,
}: {
  signal: XgiSignal | null | undefined;
  ga: number;
  xgi: string | undefined;
}) {
  if (!signal) return null;
  const copy = XGI_COPY[signal.direction];
  const t = TONE_CLASS[copy.tone];
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap ${t.soft} ${t.text}`}
      title={xgiSummary(signal, ga, xgi)}
    >
      {copy.label}
    </span>
  );
}
