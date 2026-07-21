import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import App from "./app/App";
import PrivacyPage from "./pages/PrivacyPage";
import FixturesPage from "./pages/FixturesPage";
import PlannerPage from "./pages/PlannerPage";

const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const fixturesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fixtures",
  component: FixturesPage,
});

const plannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/planner",
  component: PlannerPage,
});

const routeTree = rootRoute.addChildren([indexRoute, privacyRoute, fixturesRoute, plannerRoute]);
export const router = createRouter({ routeTree });
