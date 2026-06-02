import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import App from "./app/App";
import PrivacyPage from "./pages/PrivacyPage";

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

const routeTree = rootRoute.addChildren([indexRoute, privacyRoute]);
export const router = createRouter({ routeTree });
