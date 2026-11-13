// components/squad/PlayerOpen.tsx
import type { ReactNode } from "react";
import { usePlayerDetail } from "../../hooks/usePlayerDetail";

/** The click target that opens a player's detail modal: the whole row, or
 * just the row's player block when the row has buttons of its own. A real
 * <button>, so it's keyboard operable; a plain <div> on pages with no modal. */
export default function PlayerOpen({
  id,
  className = "",
  inline = false,
  children,
}: {
  id: number;
  className?: string;
  /** A name within text rather than a row: underline on hover, no background */
  inline?: boolean;
  children: ReactNode;
}) {
  const open = usePlayerDetail();
  if (!open)
    return inline ? <span className={className}>{children}</span> : <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={() => open(id)}
      className={`${className} cursor-pointer rounded text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
        inline ? "hover:underline" : "transition-colors hover:bg-muted/50"
      }`}
    >
      {children}
    </button>
  );
}
