import { confidence, confidenceTitle } from "../../lib/confidence";

/** "· toss-up" / "· real edge" after a projected gain; nothing in between. */
export default function ConfidenceTag({ gap, gws }: { gap: number; gws: number }) {
  const c = confidence(gap, gws);
  if (!c.level) return null;
  return (
    <span title={confidenceTitle(c)} className={c.level === "toss-up" ? "text-muted-foreground" : undefined}>
      {" · "}
      {c.level === "toss-up" ? "toss-up" : "real edge"}
      <span className="sr-only">. {confidenceTitle(c)}</span>
    </span>
  );
}
