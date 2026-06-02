import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { router } from "./router";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fullPage name="FPL Helper">
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>
);