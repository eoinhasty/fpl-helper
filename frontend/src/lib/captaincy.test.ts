import { describe, expect, it } from "vitest";
import { captaincyPicks, rankCaptains } from "./captaincy";
import { POSITIONS_442, squad } from "../test/players";
import type { FixtureLite } from "./types";

const fixture = (difficulty: number, home = true) => ({ difficulty, home }) as FixtureLite;

describe("rankCaptains", () => {
  it("ranks on the model's projection when there is one", () => {
    const players = squad(POSITIONS_442, (slot) => ({ projected_pts: slot === 7 ? 20 : slot }));
    const { rows, projected } = rankCaptains(players);
    expect(projected).toBe(true);
    expect(rows.slice(0, 3).map((r) => r.p.element)).toEqual([7, 11, 10]);
  });

  it("leaves out keepers and the bench", () => {
    const players = squad(POSITIONS_442, (slot) => ({ projected_pts: slot === 1 || slot > 11 ? 20 : 1 }));
    const ids = rankCaptains(players).rows.map((r) => r.p.element);
    expect(ids).not.toContain(1);
    expect(ids.every((id) => id <= 11)).toBe(true);
  });

  it("doesn't count a double GW twice when ep_next covers it", () => {
    // Same ep_next, same fixtures' difficulty: the double shouldn't outrank
    const players = squad(POSITIONS_442, (slot) => ({
      ep_next: slot === 10 || slot === 11 ? "6" : "1",
      start_probability: 0.9,
      fixtures: slot === 10 ? [fixture(3), fixture(3)] : [fixture(3)],
    }));
    const { rows, projected } = rankCaptains(players);
    expect(projected).toBe(false);
    const score = (el: number) => rows.find((r) => r.p.element === el)!.score;
    expect(score(10)).toBeCloseTo(score(11), 9);
  });

  it("nearly zeroes a blank GW", () => {
    const players = squad(POSITIONS_442, (slot) => ({
      ep_next: slot >= 10 && slot <= 11 ? "6" : "1",
      fixtures: slot === 10 ? [] : [fixture(3, false)],
    }));
    const score = (el: number) => rankCaptains(players).rows.find((r) => r.p.element === el)!.score;
    expect(score(10)).toBeCloseTo(score(11) * 0.1, 9);
  });
});

describe("captaincyPicks", () => {
  it("adds the best low-owned player outside the top 3", () => {
    const players = squad(POSITIONS_442, (slot) => ({
      projected_pts: slot,
      selected_by_percent: slot === 7 ? "4.0" : "40.0",
    }));
    const { picks, differential } = captaincyPicks(players);
    expect(picks.map((r) => r.p.element)).toEqual([11, 10, 9]);
    expect(differential?.p.element).toBe(7);
  });

  it("has no differential when everyone is highly owned", () => {
    const players = squad(POSITIONS_442, (slot) => ({ projected_pts: slot, selected_by_percent: "40" }));
    expect(captaincyPicks(players).differential).toBeNull();
  });
});
