import type { FixtureLite } from "../../lib/types";
import { fdrClass } from "../../lib/utils";

export default function FixturePill({ f }: { f?: FixtureLite | null }) {
  if (!f) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${fdrClass(f.difficulty)}`}
      title={`${f.home ? "Home" : "Away"} • Difficulty ${f.difficulty}`}
    >
      {f.home ? "v" : "@"}{f.opp} • FDR {f.difficulty}
    </span>
  );
}