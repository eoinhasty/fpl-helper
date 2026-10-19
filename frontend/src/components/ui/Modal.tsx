// components/ui/Modal.tsx
import * as React from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** id of the element that names the dialog (its title) */
  labelledBy: string;
  /** Width utility for the panel, e.g. "w-[min(32rem,_94vw)]" */
  widthClass: string;
  /** Element to focus on open; defaults to the first focusable in the panel */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared dialog shell: backdrop, centred panel sized around the mobile tab
 * bar, Escape to close, a Tab focus trap, and focus moved in on open and
 * restored to the trigger on close. Callers own everything inside the panel. */
export default function Modal({ open, onClose, labelledBy, widthClass, initialFocusRef, children }: Props) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open, initialFocusRef]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Wrap Tab/Shift+Tab at the panel's edges so focus can't leave into the page behind
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`absolute left-1/2 top-4 lg:top-10 -translate-x-1/2 ${widthClass} max-h-[calc(100dvh-2rem-3.5rem-env(safe-area-inset-bottom))] lg:max-h-[calc(100vh-5rem)] rounded-2xl bg-card text-foreground shadow-card border border-border flex flex-col overflow-hidden`}
      >
        {children}
      </div>
    </div>
  );
}
