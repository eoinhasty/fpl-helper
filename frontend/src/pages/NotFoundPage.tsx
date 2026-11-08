// pages/NotFoundPage.tsx
import { Link } from "@tanstack/react-router";
import AppShell from "../components/layout/AppShell";

/** Any URL with no route — was a bare "Not Found" with no way back */
export default function NotFoundPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">There's nothing at this address.</p>
        <Link
          to="/"
          className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Go to the dashboard
        </Link>
      </main>
    </AppShell>
  );
}
