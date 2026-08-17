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
  containerClassName = "",
  contentClassName = "",
  footer,
}: Props) {
  // Below `lg` the two asides stop being sticky columns and instead stack
  // full-width in the main flow — content is never hidden on mobile, it
  // just reads top-to-bottom instead of three-across. Main content leads
  // (order-1), then the right/"insights" panel (order-2, most directly
  // related to the squad above it), then the left/"leagues" panel
  // (order-3). At `lg`, `lg:order-none` drops back to source order (left,
  // main, right) for the normal 3-column layout.
  //
  // (There used to be an `xl` variant of this breakpoint too, selectable
  // via a `sidebarBreakpoint` prop — removed since no caller ever used
  // anything but the `lg` default. Re-add if a future page needs it.)

  const GAP: Record<number, string> = {
    0: "gap-0", 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4",
    5: "gap-5", 6: "gap-6", 7: "gap-7", 8: "gap-8", 9: "gap-9", 10: "gap-10",
  };

  const gapClass = GAP[gap] ?? "gap-5";

  return (
    <div
      className={`w-full mx-auto px-4 py-4 grid grid-cols-12 ${gapClass} ${containerClassName}`}
      style={{ maxWidth: `${maxWidthPx}px` }}
    >
      {top && <div className="col-span-12">{top}</div>}

      <aside
        className="col-span-12 lg:col-span-3 order-3 lg:order-none space-y-4 self-start lg:sticky"
        style={{ top: stickyOffsetPx }}
        aria-label="Left sidebar"
      >
        {left}
      </aside>

      <main
        id="main-content"
        role="main"
        className={`col-span-12 lg:col-span-6 order-1 lg:order-none space-y-4 ${contentClassName}`}
      >
        {children}
      </main>

      <aside
        className="col-span-12 lg:col-span-3 order-2 lg:order-none space-y-4 self-start lg:sticky"
        style={{ top: stickyOffsetPx }}
        aria-label="Right sidebar"
      >
        {right}
      </aside>

      {footer && <div className="col-span-12 order-4">{footer}</div>}
    </div>
  );
}
