import { describe, expect, it } from "vitest";
import { parseMarkInput, toMark } from "./card-mark";

describe("toMark (stored values)", () => {
  it("passes the two known marks and drops everything else", () => {
    expect(toMark("owned")).toBe("owned");
    expect(toMark("missing")).toBe("missing");
    expect(toMark(null)).toBeNull();
    expect(toMark(undefined)).toBeNull();
    expect(toMark("purple")).toBeNull();
    expect(toMark("OWNED")).toBeNull();
  });
});

describe("parseMarkInput (request values)", () => {
  it("accepts the known marks and null (clear)", () => {
    expect(parseMarkInput("owned")).toBe("owned");
    expect(parseMarkInput("missing")).toBe("missing");
    expect(parseMarkInput(null)).toBeNull();
  });

  it("flags anything else as invalid with undefined", () => {
    for (const bad of ["purple", "null", "", "Owned", 1, true, {}, [], undefined]) {
      expect(parseMarkInput(bad), String(bad)).toBeUndefined();
    }
  });
});
