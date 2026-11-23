import { describe, expect, it } from "vitest";
import { headToHead, leagueEo, leftLabel, signed, stillToCome, swings } from "./leagueLive";
import type { LeagueLiveEntry, LeagueLivePlayer } from "./types";

const entry = (id: number, picks: [number, number][]): LeagueLiveEntry =>
  ({
    entry: id,
    picks: picks.map(([element, multiplier]) => ({ element, multiplier })),
  }) as LeagueLiveEntry;

const pl = (points: number, state: LeagueLivePlayer["state"] = "done"): LeagueLivePlayer => ({
  name: null,
  team: null,
  position: 3,
  points,
  state,
  fixtures: [],
  shirt_url: null,
});

const players = { 1: pl(10), 2: pl(5), 3: pl(2, "to_play"), 4: pl(8) };

describe("headToHead", () => {
  it("cancels shared players so each side sums to the gap", () => {
    // A captains 1, B starts 1; A has 2, B has 4; both start 3
    const a = entry(1, [
      [1, 2],
      [2, 1],
      [3, 1],
    ]);
    const b = entry(2, [
      [1, 1],
      [4, 1],
      [3, 1],
    ]);
    const h = headToHead(a, b, players);
    expect(h.ours.map((d) => [d.element, d.times])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(h.theirs.map((d) => d.element)).toEqual([4]);
    // A's GW: 20 + 5 + 2 = 27; B's: 10 + 8 + 2 = 20
    expect(h.oursPoints - h.theirsPoints).toBe(7);
    expect(h.oursLeft).toBe(0);
  });
});

describe("league ownership", () => {
  it("averages multipliers over scored entries only", () => {
    const eo = leagueEo([entry(1, [[1, 2]]), entry(2, [[1, 1]]), { entry: 3, picks: null } as LeagueLiveEntry]);
    expect(eo.get(1)).toBe(1.5);
  });

  it("splits what's left into yours and threats", () => {
    const me = entry(1, [[3, 1]]);
    const eo = new Map([
      [3, 0.2],
      [1, 1],
    ]);
    const { yours, threats } = stillToCome(swings(me, eo, players));
    expect(yours.map((s) => s.element)).toEqual([3]);
    // Player 1 is done, so not a threat any more
    expect(threats).toEqual([]);
  });
});

it("formats", () => {
  expect(signed(1.26)).toBe("+1.3");
  expect(signed(-2)).toBe("−2.0");
  expect(signed(0)).toBe("0.0");
  expect(leftLabel({ playing: 1, to_play: 2 } as LeagueLiveEntry)).toBe("3 left");
  expect(leftLabel({ playing: 0, to_play: 0 } as LeagueLiveEntry)).toBe("done");
});
