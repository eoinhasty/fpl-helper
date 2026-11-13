import * as React from "react";
import AppShell from "../components/layout/AppShell";
import DataCard from "../components/ui/DataCard";
import FdrGrid, { type TickerView } from "../components/fixtures/FdrGrid";
import { Segmented } from "../components/controls/Segmented";
import { useFetch } from "../hooks/useFetch";
import type { FdrGridResponse } from "../lib/types";

type Horizon = "3" | "6" | "8" | "12";

const TITLES: Record<TickerView, string> = {
  fdr: "Fixture difficulty",
  attack: "Attacking fixtures",
  defence: "Defensive fixtures",
};

export default function FixturesPage() {
  const [horizon, setHorizon] = React.useState<Horizon>("6");
  const [view, setView] = React.useState<TickerView>("fdr");
  const { data, loading, error } = useFetch<FdrGridResponse>(`/api/fixtures/grid?horizon=${horizon}`);
  // Attack/Defence need the team ratings published with the projections
  const hasModel = data?.league_xg != null;
  const shownView = hasModel ? view : "fdr";

  return (
    <AppShell>
      <div className="mx-auto w-full space-y-4 px-4 py-4" style={{ maxWidth: 1400 }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h1 className="text-lg font-semibold text-foreground">Fixture ticker</h1>
          <div className="flex flex-wrap items-center gap-2">
            {hasModel && (
              <Segmented<TickerView>
                value={view}
                onChange={setView}
                options={[
                  { label: "FDR", value: "fdr" },
                  { label: "Attack", value: "attack" },
                  { label: "Defence", value: "defence" },
                ]}
              />
            )}
            <Segmented<Horizon>
              value={horizon}
              onChange={setHorizon}
              options={[
                { label: "3 GW", value: "3" },
                { label: "6 GW", value: "6" },
                { label: "8 GW", value: "8" },
                { label: "12 GW", value: "12" },
              ]}
            />
          </div>
        </div>
        <DataCard title={TITLES[shownView]} loading={loading} error={error} empty={!data}>
          {data && <FdrGrid data={data} view={shownView} />}
        </DataCard>
      </div>
    </AppShell>
  );
}
