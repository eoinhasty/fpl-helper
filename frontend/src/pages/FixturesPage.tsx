import * as React from "react";
import TopNav from "../components/layout/TopNav";
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
    <div className="min-h-screen page-bg flex flex-col">
      <TopNav />
      <div className="mx-auto w-full px-4 py-4 space-y-4" style={{ maxWidth: 1400 }}>
        <div className="flex items-center justify-between gap-4">
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
      <footer className="mt-auto py-4 text-center text-xs text-muted-foreground/60">
        Not affiliated with or endorsed by Fantasy Premier League or the Premier League.{" "}
        <a href="/privacy" className="underline hover:text-muted-foreground">Privacy policy</a>
      </footer>
    </div>
  );
}
