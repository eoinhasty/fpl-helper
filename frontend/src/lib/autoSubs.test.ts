import { describe, expect, it } from "vitest";
import cases from "../../../testdata/auto_subs.json";
import { autoSubs, bestBenchOrder, expectedSubPoints } from "./autoSubs";
import { POSITIONS_442, squad } from "../test/players";

describe("autoSubs (shared with mini_league.auto_subs)", () => {
  it.each(cases)("$name", ({ positions, blank, subs }) => {
    const players = squad(positions);
    const played = (p: { element: number }) => !blank.includes(p.element);
    const on = autoSubs(players.slice(0, 11), players.slice(11), played);
    // Shared cases list [out, in]; autoSubs returns who comes on, in order
    expect(on.map((p) => p.element)).toEqual(subs.map(([, inn]) => inn));
  });
});

describe("bench order", () => {
  const players = squad(POSITIONS_442);
  const xi = players.slice(0, 11);
  const outfieldBench = players.slice(12);

  it("adds nothing when every starter is certain to play", () => {
    const pts = expectedSubPoints(
      xi,
      outfieldBench,
      () => 1,
      () => 5,
    );
    expect(pts).toBe(0);
  });

  it("puts a doubtful high scorer ahead of a reliable low one", () => {
    // A defender (slot 2) is 50/50; bench DEF 13 is reliable on 2 pts,
    // bench MID 14 doubtful but on 10 when they play
    const chance = (p: { element: number }) => (p.element === 2 ? 0.5 : p.element === 14 ? 0.6 : 1);
    const value = (p: { element: number }) => (p.element === 14 ? 10 : 2);
    const order = bestBenchOrder(xi, outfieldBench, chance, value);
    expect(order.map((p) => p.element)).toEqual([14, 13, 15]);
  });

  it("keeps the user's order unless another beats it by a clear margin", () => {
    // Swapping MID 14 (2.04) ahead of DEF 13 (2) gains 0.02 expected points
    const order = bestBenchOrder(
      xi,
      outfieldBench,
      (p) => (p.element === 2 ? 0.5 : 1),
      (p) => (p.element === 14 ? 2.04 : 2),
    );
    expect(order).toBe(outfieldBench);
  });
});
