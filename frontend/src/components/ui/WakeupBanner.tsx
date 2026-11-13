interface Props {
  visible: boolean;
}

export function WakeupBanner({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="flex w-full items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-sm text-amber-300">
      <span
        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
        aria-hidden
      />
      <span>Backend is waking up — this may take up to a minute on first load.</span>
    </div>
  );
}
