import SquadDashboard from "../pages/SquadDashboard";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";

export default function App() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
      <ErrorBoundary name="Squad Dashboard">
        <SquadDashboard />
      </ErrorBoundary>
    </div>
  );
}