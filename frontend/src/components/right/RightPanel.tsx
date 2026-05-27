import * as React from "react";
import { Segmented } from "../controls/Segmented";
import CaptaincyCard from "./CaptaincyCard";
import HealthCard from "./HealthCard";
import HotNewsCard from "./HotNewsCard";
import NextMatchCard from "./NextMatchCard";
import StandingsCard from "./StandingsCard";
import type { Player } from "../../lib/types";

type Tab = "squad" | "football";

export default function RightPanel({
  players,
  loading,
  isHistorical,
  onPlayerClick,
}: {
  players?: Player[] | null;
  loading?: boolean;
  isHistorical?: boolean;
  onPlayerClick?: (p: Player) => void;
}) {
  const [tab, setTab] = React.useState<Tab>("squad");

  return (
    <div className="space-y-4">
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        fullWidth
        ariaLabel="Right panel sections"
        options={[
          { label: "Squad", value: "squad" },
          { label: "Football", value: "football" },
        ]}
      />

      {tab === "squad" && (
        <>
          <CaptaincyCard players={players} loading={loading} isHistorical={isHistorical} onPlayerClick={onPlayerClick} />
          <HealthCard players={players} loading={loading} />
          <HotNewsCard />
        </>
      )}

      {tab === "football" && (
        <>
          <NextMatchCard />
          <StandingsCard />
        </>
      )}
    </div>
  );
}
