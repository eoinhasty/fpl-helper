interface Props {
  visible: boolean;
}

export function WakeupBanner({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-center gap-3 text-sm text-amber-300">
      <span
        className="inline-block w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0"
        aria-hidden
      />
      <span>
        Backend is waking up — this may take up to a minute on first load.
      </span>
    </div>
  );
}
