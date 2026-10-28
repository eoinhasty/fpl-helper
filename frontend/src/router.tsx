import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet } from "@tanstack/react-router";
import App from "./app/App";

// The dashboard is the landing page and stays in the main bundle; the other
// pages load on demand so a dashboard visitor doesn't download the planner's
// player table. Nav links preload a page's chunk on hover/touch ("intent").

const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: lazyRouteComponent(() => import("./pages/PrivacyPage")),
});

const fixturesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fixtures",
  component: lazyRouteComponent(() => import("./pages/FixturesPage")),
});

const plannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/planner",
  component: lazyRouteComponent(() => import("./pages/PlannerPage")),
});

const routeTree = rootRoute.addChildren([indexRoute, privacyRoute, fixturesRoute, plannerRoute]);
export const router = createRouter({ routeTree, defaultPreload: "intent" });
