// components/layout/TopNav.tsx
import * as React from "react";
import { Link } from "@tanstack/react-router";
import SettingsModal from "../settings/SettingsModal";
import { useEntryId } from "../../hooks/useEntryID";

type Props = {
  title?: string;
  maxWidthPx?: number;
  className?: string;
};

const NAV_LINKS = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/fixtures", label: "Fixtures", exact: false },
  { to: "/planner", label: "Planner", exact: false },
] as const;

export default function TopNav({ title = "FF Helper", maxWidthPx = 1400, className = "" }: Props) {
  const { entry, setEntry } = useEntryId();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <header className={["border-b border-border", className].filter(Boolean).join(" ")} role="banner">
        <div className="mx-auto flex items-center px-4 py-2 lg:py-3" style={{ maxWidth: `${maxWidthPx}px` }}>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`${title} home`}
          >
            <div className="grid h-9 w-9 place-content-center rounded-lg bg-primary font-bold text-primary-foreground">
              ⚽
            </div>
            <div className="font-semibold text-foreground">{title}</div>
          </Link>

          {/* Primary route nav — below `lg` the bottom tab bar (MobileTabBar,
              rendered by AppShell) is the way to move between routes instead. */}
          <nav className="mx-4 hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                activeProps={{ className: "px-3 py-2 rounded-xl text-sm bg-primary text-primary-foreground shadow-sm" }}
                activeOptions={link.exact ? { exact: true } : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          <IconBtn label="Settings" onClick={() => setOpen(true)} title="Settings" ariaLabel="Open settings">
            ⚙️
          </IconBtn>
        </div>
      </header>

      <SettingsModal open={open} onClose={() => setOpen(false)} entry={entry} setEntry={setEntry} />
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
    <button type="button" className="btn" onClick={onClick} title={title} aria-label={ariaLabel || label}>
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
