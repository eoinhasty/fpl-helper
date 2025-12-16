// components/layout/DashboardLayout.tsx
import * as React from "react";
import TopNav from "./TopNav";

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;
  top?: React.ReactNode;
  children: React.ReactNode;

  /** Optional overrides (all have safe defaults matching current UI) */
  maxWidthPx?: number;              // container max width
  gap?: number;                     // tailwind gap scale (e.g. 5 -> gap-5)
  stickyOffsetPx?: number;          // distance from top for sticky asides
  hideLeft?: boolean;
  hideRight?: boolean;
  sidebarBreakpoint?: "lg" | "xl";  // when sidebars become visible
  className?: string;               // wrapper class
  containerClassName?: string;      // inner grid container class
  contentClassName?: string;        // main content column class
  TopNavComponent?: React.ComponentType; // swap nav if needed
  footer?: React.ReactNode;         // optional footer area
};

export default function DashboardLayout({
  left,
  right,
  top,
  children,

  maxWidthPx = 1400,
  gap = 5,
  stickyOffsetPx = 64, // ~ top-16
  hideLeft = false,
  hideRight = false,
  sidebarBreakpoint = "xl",
  className = "",
  containerClassName = "",
  contentClassName = "",
  TopNavComponent = TopNav,
  footer,
}: Props) {
  // build responsive classes without pulling in extra deps
  const bp = sidebarBreakpoint; // "lg" | "xl"
  const leftCol = `${bp}:col-span-3`;
  const rightCol = `${bp}:col-span-3`;
  const mainCol = `col-span-12 ${bp}:col-span-6`;
  const leftHide = `hidden ${bp}:block`;
  const rightHide = `hidden ${bp}:block`;
  const gapClass = `gap-${gap}`;

  return (
    <div className={`min-h-screen bg-background text-foreground ${className}`}>
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50
                   focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-primary focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <TopNavComponent />

      <div
        className={`mx-auto px-4 py-4 grid grid-cols-12 ${gapClass} ${containerClassName}`}
        style={{ maxWidth: `${maxWidthPx}px` }}
      >
        {top && <div className="col-span-12">{top}</div>}

        {!hideLeft && (
          <aside
            className={`${leftHide} ${leftCol} space-y-4 self-start`}
            style={{ position: "sticky", top: stickyOffsetPx }}
            aria-label="Left sidebar"
          >
            {left}
          </aside>
        )}

        <main
          id="main-content"
          role="main"
          className={`${mainCol} space-y-4 ${contentClassName}`}
        >
          {children}
        </main>

        {!hideRight && (
          <aside
            className={`${rightHide} ${rightCol} space-y-4 self-start`}
            style={{ position: "sticky", top: stickyOffsetPx }}
            aria-label="Right sidebar"
          >
            {right}
          </aside>
        )}

        {footer && <div className="col-span-12">{footer}</div>}
      </div>
    </div>
  );
}