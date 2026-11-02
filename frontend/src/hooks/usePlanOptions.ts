// hooks/usePlanOptions.ts — the transfer plan card's options, per entry,
// persisted so a kept player or a wildcard week survives a reload.
import * as React from "react";
import { DEFAULT_PLAN_OPTIONS, type PlanOptions } from "../lib/transferPlan";

const KEY = "fpl-plan-options-v1";

function readAll(): Record<string, PlanOptions> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function usePlanOptions(entry: number | "") {
  const [all, setAll] = React.useState(readAll);
  const options = (entry && all[entry]) || DEFAULT_PLAN_OPTIONS;

  const setOptions = React.useCallback(
    (next: PlanOptions) => {
      if (!entry) return;
      setAll((prev) => {
        const updated = { ...prev, [entry]: next };
        try {
          localStorage.setItem(KEY, JSON.stringify(updated));
        } catch {
          // storage full or blocked — the options still apply for this visit
        }
        return updated;
      });
    },
    [entry],
  );
  return [options, setOptions] as const;
}
