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

export default function TopNav({
  title = "FF Helper",
  maxWidthPx = 1400,
  className = "",
}: Props) {
  const { entry, setEntry } = useEntryId();
  const [open, setOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);

  // Close the mobile nav on Escape, and if the viewport grows past the
  // breakpoint where it's hidden anyway (avoids stale open state if a
  // phone is rotated to landscape/tablet width while the menu is open).
  React.useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    const mql = window.matchMedia("(min-width: 640px)");
    function onBreakpoint() {
      if (mql.matches) setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    mql.addEventListener("change", onBreakpoint);
    return () => {
      window.removeEventListener("keydown", onKey);
      mql.removeEventListener("change", onBreakpoint);
    };
  }, [navOpen]);

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
          <IconBtn
            label="Toggle navigation menu"
            onClick={() => setNavOpen((v) => !v)}
            ariaLabel={navOpen ? "Close navigation menu" : "Open navigation menu"}
            className="sm:hidden mr-2"
            expanded={navOpen}
            controls="mobile-primary-nav"
          >
            {navOpen ? <CloseIcon /> : <MenuIcon />}
          </IconBtn>

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
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
                activeProps={{ className: "px-3 py-2 rounded-xl text-sm bg-primary text-primary-foreground shadow-sm" }}
                activeOptions={link.exact ? { exact: true } : undefined}
              >
                {link.label}
              </Link>
            ))}
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

        {/* Mobile nav panel — the <nav> above is hidden below `sm`, so this is
            the only way to reach Fixtures/Planner on a phone. */}
        {navOpen && (
          <nav
            id="mobile-primary-nav"
            className="sm:hidden border-t border-border px-4 py-2"
            aria-label="Primary"
          >
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setNavOpen(false)}
                  className="px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
                  activeProps={{ className: "px-3 py-2.5 rounded-xl text-sm bg-primary text-primary-foreground shadow-sm" }}
                  activeOptions={link.exact ? { exact: true } : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
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

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5.5H17M3 10H17M3 14.5H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 4.5L15.5 15.5M15.5 4.5L4.5 15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Small helper for consistent, accessible icon buttons */
function IconBtn({
  children,
  onClick,
  title,
  ariaLabel,
  label, // visually hidden text for screen readers
  className = "",
  expanded,
  controls,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  label: string;
  className?: string;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      className={["btn", className].filter(Boolean).join(" ")}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || label}
      aria-expanded={expanded}
      aria-controls={controls}
    >
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
