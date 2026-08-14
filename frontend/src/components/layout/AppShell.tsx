// components/layout/AppShell.tsx
import type * as React from "react";
import TopNav from "./TopNav";
import MobileTabBar from "./MobileTabBar";

type Props = {
  children: React.ReactNode;
};

/**
 * Shared page shell: header nav, page content, legal footer, and the mobile
 * bottom tab bar. Consolidates what App.tsx / PlannerPage.tsx /
 * FixturesPage.tsx each used to hand-roll individually. The bottom padding
 * here is what keeps content (and the footer) from being covered by
 * MobileTabBar's fixed position below `lg`.
 */
export default function AppShell({ children }: Props) {
  return (
    <div className="min-h-screen page-bg flex flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <TopNav />

      {children}

      <footer className="mt-auto pt-2 pb-2 lg:py-4 text-center text-[10px] lg:text-xs text-muted-foreground/40 lg:text-muted-foreground/60">
        Not affiliated with or endorsed by Fantasy Premier League or the Premier League.{" "}
        <a href="/privacy" className="underline hover:text-muted-foreground">Privacy policy</a>
      </footer>

      <MobileTabBar />
    </div>
  );
}
