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
  sidebarBreakpoint = "lg",
  className = "",
  containerClassName = "",
  contentClassName = "",
  TopNavComponent = TopNav,
  footer,
}: Props) {
    // build responsive classes without pulling in extra deps
    const BP = {
      lg: {
        leftCol: "lg:col-span-3",
        rightCol: "lg:col-span-3",
        mainCol: "col-span-12 lg:col-span-6",
        hide: "hidden lg:block",
      },
      xl: {
        leftCol: "xl:col-span-3",
        rightCol: "xl:col-span-3",
        mainCol: "col-span-12 xl:col-span-6",
        hide: "hidden xl:block",
      },
    } as const;

    const GAP: Record<number, string> = {
      0: "gap-0",
      1: "gap-1",
      2: "gap-2",
      3: "gap-3",
      4: "gap-4",
      5: "gap-5",
      6: "gap-6",
      7: "gap-7",
      8: "gap-8",
      9: "gap-9",
      10: "gap-10",
    };

    const { leftCol, rightCol, mainCol, hide } = BP[sidebarBreakpoint];
    const gapClass = GAP[gap] ?? "gap-5";


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
            className={`${hide} ${leftCol} space-y-4 self-start`}
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
            className={`${hide} ${rightCol} space-y-4 self-start`}
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