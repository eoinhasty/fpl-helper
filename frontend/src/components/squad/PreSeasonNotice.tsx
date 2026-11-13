import Card from "../ui/Card";
import { useCountdown } from "../../hooks/useCountdown";
import { fmtKickoff } from "../../lib/format";

export default function PreSeasonNotice({ deadlineISO }: { deadlineISO?: string | null }) {
  const { text, ended } = useCountdown(deadlineISO);

  return (
    <Card className="p-8 text-center">
      <div className="mb-3 text-4xl">🌱</div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">The new season hasn't started yet</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Your squad will appear here once you've confirmed your picks and the first deadline passes.
      </p>
      {deadlineISO && !ended && (
        <div>
          <div className="mb-1 text-xs tracking-wide text-muted-foreground uppercase">
            GW1 deadline · {fmtKickoff(deadlineISO)}
          </div>
          <div className="text-2xl font-bold text-foreground tabular-nums">{text}</div>
        </div>
      )}
    </Card>
  );
}
