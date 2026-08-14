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
  sidebarBreakpoint = "lg",
  containerClassName = "",
  contentClassName = "",
  footer,
}: Props) {
  // Below the sidebar breakpoint the two asides stop being sticky columns and
  // instead stack full-width in the main flow — content is never hidden on
  // mobile, it just reads top-to-bottom instead of three-across. Main
  // content leads (order-1), then the right/"insights" panel (order-2, most
  // directly related to the squad above it), then the left/"leagues"
  // panel (order-3). At the breakpoint, `*:order-none` drops back to
  // source order (left, main, right) for the normal 3-column layout.
  const BP = {
    lg: {
      leftCol: "col-span-12 lg:col-span-3",
      rightCol: "col-span-12 lg:col-span-3",
      mainCol: "col-span-12 lg:col-span-6",
      sticky: "lg:sticky",
    },
    xl: {
      leftCol: "col-span-12 xl:col-span-3",
      rightCol: "col-span-12 xl:col-span-3",
      mainCol: "col-span-12 xl:col-span-6",
      sticky: "xl:sticky",
    },
  } as const;

  const GAP: Record<number, string> = {
    0: "gap-0", 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4",
    5: "gap-5", 6: "gap-6", 7: "gap-7", 8: "gap-8", 9: "gap-9", 10: "gap-10",
  };

  const { leftCol, rightCol, mainCol, sticky } = BP[sidebarBreakpoint];
  const gapClass = GAP[gap] ?? "gap-5";
  const orderNoneAtBp = sidebarBreakpoint === "lg" ? "lg:order-none" : "xl:order-none";

  return (
    <div
      className={`mx-auto px-4 py-4 grid grid-cols-12 ${gapClass} ${containerClassName}`}
      style={{ maxWidth: `${maxWidthPx}px` }}
    >
      {top && <div className="col-span-12">{top}</div>}

      <aside
        className={`${leftCol} order-3 ${orderNoneAtBp} space-y-4 self-start ${sticky}`}
        style={{ top: stickyOffsetPx }}
        aria-label="Left sidebar"
      >
        {left}
      </aside>

      <main
        id="main-content"
        role="main"
        className={`${mainCol} order-1 ${orderNoneAtBp} space-y-4 ${contentClassName}`}
      >
        {children}
      </main>

      <aside
        className={`${rightCol} order-2 ${orderNoneAtBp} space-y-4 self-start ${sticky}`}
        style={{ top: stickyOffsetPx }}
        aria-label="Right sidebar"
      >
        {right}
      </aside>

      {footer && <div className="col-span-12 order-4">{footer}</div>}
    </div>
  );
}
