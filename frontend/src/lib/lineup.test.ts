import { describe, expect, it } from "vitest";
import { FORMATIONS, previewLineup, suggestLineup } from "./lineup";
import { POSITIONS_442, squad } from "../test/players";

describe("FORMATIONS", () => {
  it("lists FPL's legal formations", () => {
    expect(FORMATIONS.map((f) => f.join("-")).sort()).toEqual(
      ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-2-3", "5-3-2", "5-4-1"].sort(),
    );
  });
});

describe("suggestLineup", () => {
  it("leaves a lineup that's already best alone", () => {
    const players = squad(POSITIONS_442, (slot) => ({ projected_pts: slot <= 11 ? 5 : 1 }));
    const s = suggestLineup(players)!;
    expect(s.gain).toBe(0);
    expect(s.bringIn).toEqual([]);
    expect(s.formation).toBe("4-4-2");
  });

  it("brings on a better bench player, changing formation if needed", () => {
    // Bench FWD 15 projects 9; the weakest starter is DEF 5 on 1
    const players = squad(POSITIONS_442, (slot) => ({
      projected_pts: slot === 15 ? 9 : slot === 5 || slot > 11 ? 1 : 4,
    }));
    const s = suggestLineup(players)!;
    expect(s.bringIn.map((p) => p.element)).toEqual([15]);
    expect(s.drop.map((p) => p.element)).toEqual([5]);
    expect(s.formation).toBe("3-4-3");
    expect(s.gain).toBeCloseTo(8, 9);
    // Spare keeper first on the bench
    expect(s.bench[0].element).toBe(12);
  });

  it("ignores a gain too small to be worth a change", () => {
    const players = squad(POSITIONS_442, (slot) => ({ projected_pts: slot === 15 ? 4.03 : slot > 11 ? 1 : 4 }));
    const s = suggestLineup(players)!;
    expect(s.bringIn).toEqual([]);
    expect(s.gain).toBe(0);
  });

  it("needs a full squad with an XI", () => {
    expect(suggestLineup(squad(POSITIONS_442).slice(0, 14))).toBeNull();
  });
});

describe("previewLineup", () => {
  it("moves the armband to the vice when the captain is benched", () => {
    const players = squad(POSITIONS_442, (slot) => ({
      projected_pts: slot === 15 ? 9 : slot === 10 ? 0 : slot > 11 ? 1 : 4,
      is_captain: slot === 10,
      is_vice_captain: slot === 6,
      multiplier: slot === 10 ? 2 : slot <= 11 ? 1 : 0,
    }));
    const s = suggestLineup(players)!;
    expect(s.drop.map((p) => p.element)).toEqual([10]);
    const preview = previewLineup(players, s);
    const by = (el: number) => preview.find((p) => p.element === el)!;
    expect(by(6)).toMatchObject({ is_captain: true, multiplier: 2 });
    expect(by(10)).toMatchObject({ is_captain: false, multiplier: 0, lineup_change: "bench" });
    expect(by(15).lineup_change).toBe("start");
    expect(preview.filter((p) => p.slot! <= 11)).toHaveLength(11);
  });
});
