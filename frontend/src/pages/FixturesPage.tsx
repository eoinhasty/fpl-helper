import * as React from "react";
import AppShell from "../components/layout/AppShell";
import DataCard from "../components/ui/DataCard";
import FdrGrid from "../components/fixtures/FdrGrid";
import { Segmented } from "../components/controls/Segmented";
import { useFetch } from "../hooks/useFetch";
import type { FdrGridResponse } from "../lib/types";

type Horizon = "3" | "6" | "8" | "12";

export default function FixturesPage() {
  const [horizon, setHorizon] = React.useState<Horizon>("6");
  const { data, loading, error } = useFetch<FdrGridResponse>(`/api/fixtures/grid?horizon=${horizon}`);

  return (
    <AppShell>
      <div className="mx-auto w-full px-4 py-4 space-y-4" style={{ maxWidth: 1400 }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <h1 className="text-lg font-semibold text-foreground">Fixture ticker</h1>
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
        <DataCard title="Fixture difficulty" loading={loading} error={error} empty={!data}>
          {data && <FdrGrid data={data} />}
        </DataCard>
      </div>
    </AppShell>
  );
}
