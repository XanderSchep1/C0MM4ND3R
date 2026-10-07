import { describe, expect, it } from "vitest";
import { clampQuantity, MAX_CARD_QUANTITY } from "./limits";

describe("clampQuantity", () => {
  it("keeps sensible values and floors fractions", () => {
    expect(clampQuantity(1)).toBe(1);
    expect(clampQuantity(37)).toBe(37);
    expect(clampQuantity(4.9)).toBe(4);
  });

  it("caps huge values at the maximum", () => {
    expect(clampQuantity(1e9)).toBe(MAX_CARD_QUANTITY);
    expect(clampQuantity(Number.MAX_SAFE_INTEGER)).toBe(MAX_CARD_QUANTITY);
    expect(clampQuantity(Infinity)).toBe(1);
  });

  it("raises too-small and non-numeric values to the minimum", () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-5)).toBe(1);
    expect(clampQuantity(NaN)).toBe(1);
    expect(clampQuantity(-5, 0)).toBe(0);
    expect(clampQuantity(NaN, 0)).toBe(0);
  });
});
