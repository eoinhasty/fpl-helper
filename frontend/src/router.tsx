import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import App from "./app/App";
import PrivacyPage from "./pages/PrivacyPage";
import FixturesPage from "./pages/FixturesPage";

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

const routeTree = rootRoute.addChildren([indexRoute, privacyRoute, fixturesRoute]);
export const router = createRouter({ routeTree });
