// components/layout/TopNav.tsx
import * as React from "react";
import SettingsModal from "../settings/SettingsModal";
import { useEntryId } from "../../hooks/useEntryID";

type Props = {
  /** App title shown next to the logo */
  title?: string;
  /** Max container width (px), default 1400 to match layout */
  maxWidthPx?: number;
  /** Optional custom nav content (center area) */
  nav?: React.ReactNode;
  /** Right-side custom actions (rendered before the settings button) */
  actionsLeft?: React.ReactNode;
  /** Hide the search button if you don’t use it */
  hideSearch?: boolean;
  /** Callback for search button (optional) */
  onSearch?: () => void;
  /** Extra class on the header element */
  className?: string;
};

export default function TopNav({
  title = "FF Helper",
  maxWidthPx = 1400,
  nav,
  actionsLeft,
  hideSearch = false,
  onSearch,
  className = "",
}: Props) {
  const { entry, setEntry } = useEntryId();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <header
        className={[
          "sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur",
          className,
        ].filter(Boolean).join(" ")}
        role="banner"
      >
        <div
          className="mx-auto px-4 py-3 flex items-center gap-4"
          style={{ maxWidth: `${maxWidthPx}px` }}
        >
          {/* Brand */}
          <a
            href="/"
            className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-lg"
            aria-label={`${title} home`}
          >
            <div className="w-9 h-9 rounded-lg grid place-content-center font-bold bg-primary text-primary-foreground">
              ⚽
            </div>
            <div className="font-semibold text-foreground">{title}</div>
          </a>

          {/* Optional centered nav */}
          {nav && (
            <nav className="hidden md:flex items-center gap-4 text-sm" aria-label="Primary">
              {nav}
            </nav>
          )}

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            {actionsLeft}
            {!hideSearch && (
              <IconBtn
                label="Search"
                onClick={onSearch}
                title="Search"
                ariaLabel="Search"
              >
                🔍
              </IconBtn>
            )}
            <IconBtn
              label="Settings"
              onClick={() => setOpen(true)}
              title="Settings"
              ariaLabel="Open settings"
            >
              ⚙️
            </IconBtn>
          </div>
        </div>
      </header>

      <SettingsModal
        open={open}
        onClose={() => setOpen(false)}
        entry={entry}
        setEntry={setEntry}
      />
    </>
  );
}

/** Small helper for consistent, accessible icon buttons */
function IconBtn({
  children,
  onClick,
  title,
  ariaLabel,
  label, // visually hidden text for screen readers
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || label}
    >
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}