import SquadDashboard from "../pages/SquadDashboard";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import TopNav from "../components/layout/TopNav";
import { WakeupBanner } from "../components/ui/WakeupBanner";
import { useBackendWakeup } from "../hooks/useBackendWakeup";

export default function App() {
  const { waking } = useBackendWakeup();

  return (
    <div className="min-h-screen page-bg">
      <TopNav />
      <WakeupBanner visible={waking} />
      <ErrorBoundary name="Squad Dashboard">
        <SquadDashboard />
      </ErrorBoundary>
    </div>
  );
}
