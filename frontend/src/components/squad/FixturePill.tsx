import type { FixtureLite } from "../../lib/types";

export default function FixturePill({ f }: { f?: FixtureLite | null }) {
  if (!f) return null;
  return (
    <span
      className={`badge ${f.difficulty<=2 ? 'pill-good' : f.difficulty===4 ? 'pill-warn' : f.difficulty===5 ? 'pill-bad' : ''}`}
      title={`${f.home ? "Home" : "Away"} • Difficulty ${f.difficulty}`}
    >
      {f.home ? "v" : "@"}{f.opp} • FDR {f.difficulty}
    </span>
  );
}