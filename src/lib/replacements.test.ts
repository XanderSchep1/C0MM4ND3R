import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "./scryfall-types";

const search = vi.hoisted(() => vi.fn());
vi.mock("./cards", () => ({ searchAndCacheCards: search }));

import { findReplacements, MAX_ROWS, OPTIONS_PER_CARD } from "./replacements";

interface Spec {
  name: string;
  usd: number | null;
  rank?: number;
  type?: string;
  cmc?: number;
  text?: string;
  produces?: string[];
}
const card = ({ name, usd, rank, type = "Artifact", cmc = 2, text = "{T}: Add {C}{C}.", produces }: Spec) =>
  ({
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    type_line: type,
    cmc,
    oracle_text: text,
    color_identity: [],
    prices: usd === null ? {} : { usd: usd.toFixed(2) },
    edhrec_rank: rank,
    produced_mana: produces,
  }) as unknown as ScryfallCard;

const entry = (c: ScryfallCard, quantity = 1) => ({ card: c, quantity });
const base = { commanders: [], maybeboard: [], colorIdentity: ["G"] };

// What the Scryfall search returns for the ramp role.
const rampPool = [
  card({ name: "Arcane Signet", usd: 1.5, rank: 3 }),
  card({ name: "Cheap Rock", usd: 0.4, rank: 400 }),
  card({ name: "Mana Vault", usd: 90, rank: 60, cmc: 1 }),
  card({ name: "Overpriced Rock", usd: 12, rank: 900 }),
  card({ name: "Wrong Type Ramp", usd: 0.5, rank: 20, type: "Creature — Elf", cmc: 2, text: "{T}: Add {G}." }),
  card({ name: "Far Cost Rock", usd: 0.5, rank: 25, cmc: 6 }),
  card({ name: "No Price Rock", usd: null, rank: 10 }),
];

describe("findReplacements", () => {
  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue({ cards: rampPool, hasMore: false });
  });

  it("cheaper: offers same-type, similar-cost, more-affordable cards, most played first", async () => {
    const expensive = card({ name: "Pricey Signet", usd: 10, rank: 50 });
    const { rows } = await findReplacements({ ...base, mainboard: [entry(expensive)], mode: "cheaper" });
    expect(rows).toHaveLength(1);
    expect(rows[0].current.name).toBe("Pricey Signet");
    expect(rows[0].role).toBe("Ramp");
    // Arcane Signet (rank 3) before Cheap Rock (rank 400); both save at least $1.
    expect(rows[0].options.map((o) => o.card.name)).toEqual(["Arcane Signet", "Cheap Rock"]);
    expect(rows[0].options[0].priceDiff).toBeCloseTo(-8.5, 2);
    // Never the wrong type, a very different cost, an unpriced card, or something not cheaper.
    const all = rows[0].options.map((o) => o.card.name);
    for (const bad of ["Wrong Type Ramp", "Far Cost Rock", "No Price Rock", "Mana Vault", "Overpriced Rock"]) expect(all).not.toContain(bad);
  });

  it("cheaper: leaves cards that are already cheap alone", async () => {
    const { rows, checked } = await findReplacements({ ...base, mainboard: [entry(card({ name: "Penny Rock", usd: 1.2, rank: 100 }))], mode: "cheaper" });
    expect(rows).toEqual([]);
    expect(checked).toBe(1);
  });

  it("pricier: offers more expensive cards that are also more played", async () => {
    const current = card({ name: "Budget Rock", usd: 1, rank: 500 });
    const { rows } = await findReplacements({ ...base, mainboard: [entry(current)], mode: "pricier" });
    const names = rows[0].options.map((o) => o.card.name);
    expect(names).toEqual(["Mana Vault"]);
    expect(names).not.toContain("Overpriced Rock"); // pricier, but less played than Budget Rock (rank 900 vs 500)
    expect(names).not.toContain("Arcane Signet"); // more played, but not pricier
    expect(rows[0].options.every((o) => o.priceDiff >= 2)).toBe(true);
  });

  it("never suggests a card that is already in the deck or maybeboard", async () => {
    const expensive = card({ name: "Pricey Signet", usd: 10, rank: 50 });
    const { rows } = await findReplacements({
      ...base,
      mainboard: [entry(expensive), entry(card({ name: "Arcane Signet", usd: 1.5, rank: 3 }))],
      maybeboard: [entry(card({ name: "Cheap Rock", usd: 0.4, rank: 400 }))],
      mode: "cheaper",
    });
    expect(rows).toEqual([]); // both cheaper candidates are already owned
  });

  it("offers each replacement only once, to the card it saves the most on", async () => {
    const a = card({ name: "Pricey A", usd: 30, rank: 40 });
    const b = card({ name: "Pricey B", usd: 10, rank: 41 });
    const { rows } = await findReplacements({ ...base, mainboard: [entry(a), entry(b)], mode: "cheaper" });
    const offered = rows.flatMap((r) => r.options.map((o) => o.card.name));
    expect(new Set(offered).size).toBe(offered.length);
    expect(rows[0].current.name).toBe("Pricey A");
  });

  it("skips basic lands, searches each role once, and reports how many cards had a role", async () => {
    const basic = card({ name: "Forest", usd: null, type: "Basic Land — Forest", cmc: 0, text: "" });
    const vanilla = card({ name: "Pet Card", usd: 20, type: "Creature — Bear", text: "Whenever a bear enters, scream." });
    const r1 = card({ name: "Pricey A", usd: 30, rank: 40 });
    const r2 = card({ name: "Pricey B", usd: 10, rank: 41 });
    const result = await findReplacements({ ...base, mainboard: [entry(basic), entry(vanilla), entry(r1), entry(r2)], mode: "cheaper" });
    expect(result.checked).toBe(3); // the basic land is not counted
    expect(result.withRole).toBe(2); // the pet card has no role to compare within
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("finds replacement lands that make the same colours", async () => {
    const dual = card({ name: "Fancy Dual", usd: 25, rank: 30, type: "Land", cmc: 0, text: "{T}: Add {R} or {G}.", produces: ["R", "G"] });
    search.mockResolvedValue({
      cards: [
        card({ name: "Budget Dual", usd: 0.6, rank: 80, type: "Land", cmc: 0, produces: ["R", "G"] }),
        card({ name: "Mono Forest Land", usd: 0.2, rank: 20, type: "Land", cmc: 0, produces: ["G"] }),
      ],
      hasMore: false,
    });
    const { rows } = await findReplacements({ ...base, mainboard: [entry(dual)], mode: "cheaper" });
    expect(rows[0].role).toBe("Land");
    expect(rows[0].options.map((o) => o.card.name)).toEqual(["Budget Dual"]);
  });

  it("caps options per card and rows overall", async () => {
    const many = Array.from({ length: 10 }, (_, i) => card({ name: `Cheap ${i}`, usd: 0.1, rank: 100 + i }));
    search.mockResolvedValue({ cards: many, hasMore: false });
    const deck = Array.from({ length: 60 }, (_, i) => entry(card({ name: `Pricey ${i}`, usd: 20 + i, rank: 10 + i })));
    const { rows } = await findReplacements({ ...base, mainboard: deck, mode: "cheaper" });
    expect(rows.length).toBeLessThanOrEqual(MAX_ROWS);
    for (const row of rows) expect(row.options.length).toBeLessThanOrEqual(OPTIONS_PER_CARD);
  });
});
