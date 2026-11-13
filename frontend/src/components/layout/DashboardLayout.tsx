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

  const gapClass = GAP[gap] ?? "gap-5";

  return (
    <div
      className={`mx-auto grid w-full grid-cols-12 px-4 py-4 ${gapClass} ${containerClassName}`}
      style={{ maxWidth: `${maxWidthPx}px` }}
    >
      {top && <div className="col-span-12">{top}</div>}

      <aside
        className="order-3 col-span-12 space-y-4 self-start lg:sticky lg:order-none lg:col-span-3"
        style={{ top: stickyOffsetPx }}
        aria-label="Left sidebar"
      >
        {left}
      </aside>

      <main
        id="main-content"
        role="main"
        className={`order-1 col-span-12 space-y-4 lg:order-none lg:col-span-6 ${contentClassName}`}
      >
        {children}
      </main>

      <aside
        className="order-2 col-span-12 space-y-4 self-start lg:sticky lg:order-none lg:col-span-3"
        style={{ top: stickyOffsetPx }}
        aria-label="Right sidebar"
      >
        {right}
      </aside>

      {footer && <div className="order-4 col-span-12">{footer}</div>}
    </div>
  );
}
