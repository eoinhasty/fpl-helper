// components/layout/DashboardLayout.tsx
import * as React from "react";

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;
  top?: React.ReactNode;
  children: React.ReactNode;

  maxWidthPx?: number;
  gap?: number;
  stickyOffsetPx?: number;
  hideLeft?: boolean;
  hideRight?: boolean;
  sidebarBreakpoint?: "lg" | "xl";
  containerClassName?: string;
  contentClassName?: string;
  footer?: React.ReactNode;
};

export default function DashboardLayout({
  left,
  right,
  top,
  children,
  maxWidthPx = 1400,
  gap = 5,
  stickyOffsetPx = 64,
  hideLeft = false,
  hideRight = false,
  sidebarBreakpoint = "lg",
  containerClassName = "",
  contentClassName = "",
  footer,
}: Props) {
  const BP = {
    lg: { leftCol: "lg:col-span-3", rightCol: "lg:col-span-3", mainCol: "col-span-12 lg:col-span-6", hide: "hidden lg:block" },
    xl: { leftCol: "xl:col-span-3", rightCol: "xl:col-span-3", mainCol: "col-span-12 xl:col-span-6", hide: "hidden xl:block" },
  } as const;

  const GAP: Record<number, string> = {
    0: "gap-0", 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4",
    5: "gap-5", 6: "gap-6", 7: "gap-7", 8: "gap-8", 9: "gap-9", 10: "gap-10",
  };

  const { leftCol, rightCol, mainCol, hide } = BP[sidebarBreakpoint];
  const gapClass = GAP[gap] ?? "gap-5";

  return (
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
  );
}
