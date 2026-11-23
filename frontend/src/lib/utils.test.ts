import { describe, expect, it } from "vitest";
import fdrCases from "../../../testdata/fdr_factor.json";
import constants from "../../../testdata/constants.json";
import { XGI_MIN_MINUTES, fdrFactor, gwPointsDisplay, isStarting, priceOutlookSummary, xgBand } from "./utils";
import { player } from "../test/players";

describe("fdrFactor (shared with scoring.FDR_FACTOR)", () => {
  it.each(fdrCases)("FDR %d → %d", (avg, expected) => {
    expect(fdrFactor(avg)).toBeCloseTo(expected, 9);
  });
});

it("XGI_MIN_MINUTES matches the backend", () => {
  expect(XGI_MIN_MINUTES).toBe(constants.XGI_MIN_MINUTES);
});

describe("isStarting", () => {
  it("goes by slot, not multiplier", () => {
    // A Bench Boost week puts multiplier 1 on the bench
    expect(isStarting(player(13, 2, { multiplier: 1 }))).toBe(false);
    // A starter on multiplier 0 (blanked captain, subbed off) still starts
    expect(isStarting(player(5, 2, { multiplier: 0 }))).toBe(true);
  });

  it("falls back to multiplier without a slot", () => {
    expect(isStarting(player(1, 2, { slot: undefined, multiplier: 1 }))).toBe(true);
    expect(isStarting(player(1, 2, { slot: undefined, multiplier: 0 }))).toBe(false);
  });
});

describe("gwPointsDisplay", () => {
  it("doubles the captain", () => {
    expect(gwPointsDisplay(player(6, 3, { gw_points: 7, multiplier: 2 }))?.points).toBe(14);
  });

  it("doesn't count the bench", () => {
    expect(gwPointsDisplay(player(13, 2, { gw_points: 6 }))).toMatchObject({ points: 6, counted: false });
  });

  it("counts the bench on a Bench Boost", () => {
    expect(gwPointsDisplay(player(13, 2, { gw_points: 6, multiplier: 1 }))?.counted).toBe(true);
  });

  it("is null without live points", () => {
    expect(gwPointsDisplay(player(1, 1))).toBeNull();
  });
});

describe("xgBand", () => {
  it("bands attack ratios with higher easier", () => {
    expect([1.4, 1.2, 1.0, 0.8, 0.6].map((r) => xgBand(r, true))).toEqual([1, 2, 3, 4, 5]);
  });

  it("mirrors the bands for goals against", () => {
    expect([0.6, 0.8, 1.0, 1.2, 1.4].map((r) => xgBand(r, false))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("priceOutlookSummary", () => {
  it("prefers FPL's top band", () => {
    expect(priceOutlookSummary({ progress: 95, likely: "rise", locked_until: null })).toMatch(/rise/);
  });

  it("describes progress otherwise", () => {
    expect(priceOutlookSummary({ progress: -42.3, likely: null, locked_until: null })).toBe("42% of the way to a fall");
    expect(priceOutlookSummary({ progress: 0.2, likely: null, locked_until: null })).toBe("No change expected");
  });
});
