import Card from "../ui/Card";
import { useCountdown } from "../../hooks/useCountdown";
import { fmtKickoff } from "../../lib/format";

export default function PreSeasonNotice({ deadlineISO }: { deadlineISO?: string | null }) {
  const { text, ended } = useCountdown(deadlineISO);

  return (
    <Card className="p-8 text-center">
      <div className="text-4xl mb-3">🌱</div>
      <h2 className="text-lg font-semibold text-foreground mb-1">The new season hasn't started yet</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Your squad will appear here once you've confirmed your picks and the first
        deadline passes.
      </p>
      {deadlineISO && !ended && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            GW1 deadline · {fmtKickoff(deadlineISO)}
          </div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{text}</div>
        </div>
      )}
    </Card>
  );
}
