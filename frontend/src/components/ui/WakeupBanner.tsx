import { TONE_CLASS } from "../../lib/utils";

interface Props {
  visible: boolean;
}

export function WakeupBanner({ visible }: Props) {
  if (!visible) return null;

  return (
    <div
      className={`flex w-full items-center justify-center gap-3 border-b px-4 py-2.5 text-sm text-foreground ${TONE_CLASS.warning.soft}`}
    >
      <span
        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-warning border-t-transparent"
        aria-hidden
      />
      <span>Backend is waking up — this may take up to a minute on first load.</span>
    </div>
  );
}
