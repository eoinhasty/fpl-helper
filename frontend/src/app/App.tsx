import SquadDashboard from "../pages/SquadDashboard";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import TopNav from "../components/layout/TopNav";
import { WakeupBanner } from "../components/ui/WakeupBanner";
import { useBackendWakeup } from "../hooks/useBackendWakeup";

export default function App() {
  const { waking } = useBackendWakeup();

  return (
    <div className="min-h-screen page-bg flex flex-col">
      <TopNav />
      <WakeupBanner visible={waking} />
      <ErrorBoundary name="Squad Dashboard">
        <SquadDashboard />
      </ErrorBoundary>
      <footer className="mt-auto py-4 text-center text-xs text-muted-foreground/60">
        Not affiliated with or endorsed by Fantasy Premier League or the Premier League.{" "}
        <a href="/privacy" className="underline hover:text-muted-foreground">Privacy policy</a>
      </footer>
    </div>
  );
}
