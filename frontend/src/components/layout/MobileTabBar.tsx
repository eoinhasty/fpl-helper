// components/layout/MobileTabBar.tsx
import { Link } from "@tanstack/react-router";
import {
  UserGroupIcon as UserGroupOutline,
  CalendarDaysIcon as CalendarDaysOutline,
  ClipboardDocumentListIcon as ClipboardOutline,
} from "@heroicons/react/24/outline";
import {
  UserGroupIcon as UserGroupSolid,
  CalendarDaysIcon as CalendarDaysSolid,
  ClipboardDocumentListIcon as ClipboardSolid,
} from "@heroicons/react/24/solid";

const TABS = [
  { to: "/", label: "Squad", exact: true, Outline: UserGroupOutline, Solid: UserGroupSolid },
  { to: "/fixtures", label: "Fixtures", exact: false, Outline: CalendarDaysOutline, Solid: CalendarDaysSolid },
  { to: "/planner", label: "Planner", exact: false, Outline: ClipboardOutline, Solid: ClipboardSolid },
] as const;

/**
 * Bottom tab bar — the primary way to move between routes below `lg`.
 * Replaces TopNav's inline links entirely on mobile (see TopNav.tsx, which
 * gates its own <nav> to `hidden lg:flex`); Settings stays a header gear at
 * every width, so this is deliberately 3 tabs, not 4.
 */
export default function MobileTabBar() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/90 backdrop-blur select-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-3">
        {TABS.map(({ to, label, exact, Outline, Solid }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={exact ? { exact: true } : undefined}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {({ isActive }) => (
                <span
                  className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-primary" aria-hidden="true" />
                  )}
                  {isActive ? <Solid className="w-6 h-6" aria-hidden="true" /> : <Outline className="w-6 h-6" aria-hidden="true" />}
                  <span className="text-[10px] font-medium">{label}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
