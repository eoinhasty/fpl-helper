import SquadDashboard from "../pages/SquadDashboard";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import AppShell from "../components/layout/AppShell";
import { WakeupBanner } from "../components/ui/WakeupBanner";
import { useBackendWakeup } from "../hooks/useBackendWakeup";

export default function App() {
  const { waking } = useBackendWakeup();

  return (
    <AppShell>
      <WakeupBanner visible={waking} />
      <ErrorBoundary name="Squad Dashboard">
        <SquadDashboard />
      </ErrorBoundary>
    </AppShell>
  );
}
