import { describe, expect, it } from "vitest";
import { confidence } from "./confidence";

describe("confidence", () => {
  it("calls small one-GW gains a toss-up", () => {
    expect(confidence(0.3, 1).level).toBe("toss-up");
  });

  it("calls big gains a real edge", () => {
    expect(confidence(6, 1).level).toBe("edge");
    expect(confidence(9, 5).level).toBe("edge");
  });

  it("says nothing in between", () => {
    expect(confidence(1.2, 1).level).toBeNull();
  });

  it("clamps GWs and uses the gap's size", () => {
    expect(confidence(2, 9)).toEqual(confidence(2, 5));
    expect(confidence(-2, 1)).toEqual(confidence(2, 1));
  });
});
