// workers/planSolver.ts — solves the transfer planner's MILP off the main
// thread. The backend builds the model (backend/app/services/planner.py) and
// ships it as CPLEX LP text, since a solve takes ~15–25 s on Render's free
// tier; here it takes ~3 s on a desktop. highs ≤1.8 crashed on deep
// branch-and-bound — keep 1.15.4 or later.
import highsLoader, { type Highs } from "highs";
import wasmUrl from "highs/runtime?url";

export type SolveRequest = { model: string; options: Record<string, number | string | boolean> };
export type SolveResponse = { ok: true; status: string; values: Record<string, number> } | { ok: false; error: string };

let highs: Promise<Highs> | null = null;

self.onmessage = async (e: MessageEvent<SolveRequest>) => {
  try {
    highs ??= highsLoader({ locateFile: () => wasmUrl });
    const solution = (await highs).solve(e.data.model, e.data.options);
    // A time-limited solve can still carry an incumbent; the decoder rejects
    // it if it isn't a whole plan.
    if (solution.Status !== "Optimal" && solution.Status !== "Time limit reached") {
      throw new Error(solution.Status);
    }
    // Only the non-zero columns: the model has ~10k variables, nearly all 0
    const values: Record<string, number> = {};
    for (const [name, col] of Object.entries(solution.Columns)) {
      if ("Primal" in col && col.Primal > 0.5) values[name] = col.Primal;
    }
    self.postMessage({ ok: true, status: solution.Status, values } satisfies SolveResponse);
  } catch (err) {
    self.postMessage({ ok: false, error: (err as Error)?.message ?? String(err) } satisfies SolveResponse);
  }
};
