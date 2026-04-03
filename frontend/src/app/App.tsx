import SquadDashboard from "../pages/SquadDashboard";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { NavCenterProvider } from "../contexts/NavCenterContext";
import TopNav from "../components/layout/TopNav";

export default function App() {
  return (
    <NavCenterProvider>
      <div className="min-h-screen page-bg">
        <TopNav />
        <ErrorBoundary name="Squad Dashboard">
          <SquadDashboard />
        </ErrorBoundary>
      </div>
    </NavCenterProvider>
  );
}
