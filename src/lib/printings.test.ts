import { describe, expect, it } from "vitest";
import { cheapestPrinting, isOracleId, isSameCard, printingLabel, printingsQuery } from "./printings";
import type { ScryfallCard } from "./scryfall-types";

const printing = (name: string, usd: string | null, extra: Partial<ScryfallCard> = {}) =>
  ({ id: `${name}-${usd}`, name, type_line: "Artifact", set: "cmm", prices: usd === null ? {} : { usd }, ...extra }) as unknown as ScryfallCard;

describe("isOracleId", () => {
  it("accepts a UUID and nothing else, since it goes into a Scryfall query", () => {
    expect(isOracleId("6ad8011d-3471-4369-9d68-b264cc027487")).toBe(true);
    for (const bad of ["", "sol ring", "6ad8011d-3471-4369-9d68-b264cc027487 or name:x", "6ad8011d-3471-4369-9d68-b264cc02748", null, undefined, 5, "6ad8011d-3471-4369-9d68-b264cc027487\n-is:funny"]) {
      expect(isOracleId(bad), String(bad)).toBe(false);
    }
  });

  it("builds a query for paper printings of exactly that card", () => {
    expect(printingsQuery("6ad8011d-3471-4369-9d68-b264cc027487")).toBe("oracleid:6ad8011d-3471-4369-9d68-b264cc027487 game:paper");
  });
});

describe("isSameCard", () => {
  it("matches printings by oracle id", () => {
    expect(isSameCard({ oracle_id: "a", name: "Sol Ring" }, { oracle_id: "a", name: "Sol Ring" })).toBe(true);
    expect(isSameCard({ oracle_id: "a", name: "Sol Ring" }, { oracle_id: "b", name: "Sol Ring" })).toBe(false);
  });

  it("falls back to the name when a layout has no oracle id", () => {
    expect(isSameCard({ name: "Reversible" }, { oracle_id: "x", name: "Reversible" })).toBe(true);
    expect(isSameCard({ name: "One" }, { name: "Two" })).toBe(false);
  });
});

describe("printingLabel", () => {
  it("shows the set and the year", () => {
    expect(printingLabel({ set: "cmm", set_name: "Commander Masters", released_at: "2023-08-04" })).toBe("Commander Masters · 2023");
    expect(printingLabel({ set: "cmm", released_at: "2023-08-04" })).toBe("CMM · 2023");
    expect(printingLabel({ set: "cmm", set_name: "Commander Masters" })).toBe("Commander Masters");
  });
});

describe("cheapestPrinting", () => {
  it("picks the lowest known price, ignoring unpriced printings", () => {
    const list = [printing("a", "5.00"), printing("b", null), printing("c", "0.40"), printing("d", "1.00")];
    expect(cheapestPrinting(list)?.id).toBe("c-0.40");
  });

  it("returns null when nothing has a price", () => {
    expect(cheapestPrinting([printing("a", null)])).toBeNull();
    expect(cheapestPrinting([])).toBeNull();
  });

  it("keeps the earlier printing when two cost the same", () => {
    expect(cheapestPrinting([printing("first", "1.00"), printing("second", "1.00")])?.id).toBe("first-1.00");
  });
});
