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

export default function TopNav({
  title = "FF Helper",
  maxWidthPx = 1400,
  className = "",
}: Props) {
  const { entry, setEntry } = useEntryId();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <header
        className={[
          "border-b border-border",
          className,
        ].filter(Boolean).join(" ")}
        role="banner"
      >
        <div
          className="mx-auto px-4 py-3 flex items-center"
          style={{ maxWidth: `${maxWidthPx}px` }}
        >
          <Link
            to="/"
            className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-lg"
            aria-label={`${title} home`}
          >
            <div className="w-9 h-9 rounded-lg grid place-content-center font-bold bg-primary text-primary-foreground">
              ⚽
            </div>
            <div className="font-semibold text-foreground">{title}</div>
          </Link>

          <nav className="hidden sm:flex items-center gap-1 mx-4" aria-label="Primary">
            <Link
              to="/"
              className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
              activeProps={{ className: "px-3 py-2 rounded-xl text-sm bg-primary text-primary-foreground shadow-sm" }}
              activeOptions={{ exact: true }}
            >
              Dashboard
            </Link>
            <Link
              to="/fixtures"
              className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
              activeProps={{ className: "px-3 py-2 rounded-xl text-sm bg-primary text-primary-foreground shadow-sm" }}
            >
              Fixtures
            </Link>
            <Link
              to="/planner"
              className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
              activeProps={{ className: "px-3 py-2 rounded-xl text-sm bg-primary text-primary-foreground shadow-sm" }}
            >
              Planner
            </Link>
          </nav>

          <div className="flex-1" />

          <IconBtn
            label="Settings"
            onClick={() => setOpen(true)}
            title="Settings"
            ariaLabel="Open settings"
          >
            ⚙️
          </IconBtn>
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