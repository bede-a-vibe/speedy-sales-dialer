import { describe, expect, it } from "vitest";
import { CALLER_ID_ROTATION_INTERVAL, dialsUntilNextRotation, rotationIndex } from "@/lib/callerIdRotation";

describe("caller ID rotation", () => {
  it("rotates every 40 dials", () => {
    expect(CALLER_ID_ROTATION_INTERVAL).toBe(40);
    expect(rotationIndex(0, 3)).toBe(0);
    expect(rotationIndex(39, 3)).toBe(0);
    expect(rotationIndex(40, 3)).toBe(1);
    expect(rotationIndex(79, 3)).toBe(1);
    expect(rotationIndex(80, 3)).toBe(2);
    expect(rotationIndex(120, 3)).toBe(0);
  });

  it("stays on the only number when the pool has one", () => {
    expect(rotationIndex(1000, 1)).toBe(0);
    expect(dialsUntilNextRotation(1000, 1)).toBeNull();
  });

  it("returns -1 for an empty pool and treats bad counts as zero", () => {
    expect(rotationIndex(10, 0)).toBe(-1);
    expect(rotationIndex(Number.NaN, 2)).toBe(0);
    expect(rotationIndex(-5, 2)).toBe(0);
  });

  it("counts down to the next switch", () => {
    expect(dialsUntilNextRotation(0, 2)).toBe(40);
    expect(dialsUntilNextRotation(39, 2)).toBe(1);
    expect(dialsUntilNextRotation(40, 2)).toBe(40);
  });
});
