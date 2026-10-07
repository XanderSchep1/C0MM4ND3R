import { describe, expect, it } from "vitest";
import type { DeckCardEntry } from "./commander";
import { DEFAULT_SORT, directionLabel, groupAndSort, parseSort, sortFor, SORT_KEYS, type SortKey } from "./deck-sort";
import type { ScryfallCard } from "./scryfall-types";

interface Spec {
  name: string;
  type?: string;
  cmc?: number;
  usd?: number | null;
  rank?: number;
  colors?: string[];
  mark?: "owned" | "missing" | null;
}
const entry = ({ name, type = "Artifact", cmc = 1, usd = 1, rank, colors = [], mark = null }: Spec): DeckCardEntry => ({
  card: {
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    type_line: type,
    cmc,
    colors,
    color_identity: colors,
    prices: usd === null ? {} : { usd: usd.toFixed(2) },
    edhrec_rank: rank,
  } as unknown as ScryfallCard,
  quantity: 1,
  mark,
});

const deck: DeckCardEntry[] = [
  entry({ name: "Sol Ring", type: "Artifact", cmc: 1, usd: 3, rank: 1 }),
  entry({ name: "Llanowar Elves", type: "Creature — Elf Druid", cmc: 1, usd: 0.5, rank: 40, colors: ["G"] }),
  entry({ name: "Cultivate", type: "Sorcery", cmc: 3, usd: 0.4, rank: 12, colors: ["G"] }),
  entry({ name: "Bolt", type: "Instant", cmc: 1, usd: 1.5, rank: 5, colors: ["R"] }),
  entry({ name: "Gruul Signet", type: "Artifact", cmc: 2, usd: 0.3, colors: [] }),
  entry({ name: "Xenagos", type: "Legendary Creature — God", cmc: 4, usd: 11, rank: 200, colors: ["R", "G"], mark: "owned" }),
  entry({ name: "Command Tower", type: "Land", cmc: 0, usd: 0.25, rank: 2 }),
  entry({ name: "Mystery Card", type: "Enchantment", cmc: 9, usd: null, mark: "missing" }),
];
const names = (groups: ReturnType<typeof groupAndSort>) => groups.flatMap((g) => g.entries.map((e) => e.card.name));
const labels = (groups: ReturnType<typeof groupAndSort>) => groups.map((g) => g.label);

describe("groupAndSort: type (the default)", () => {
  it("groups by card type in the usual order, names A-Z inside each group", () => {
    const groups = groupAndSort(deck, DEFAULT_SORT);
    expect(labels(groups)).toEqual(["Creature", "Sorcery", "Instant", "Artifact", "Enchantment", "Land"]);
    expect(groups.find((g) => g.label === "Artifact")?.entries.map((e) => e.card.name)).toEqual(["Gruul Signet", "Sol Ring"]);
  });

  it("reverses groups and names when descending", () => {
    const groups = groupAndSort(deck, { key: "type", descending: true });
    expect(labels(groups)).toEqual(["Land", "Enchantment", "Artifact", "Instant", "Sorcery", "Creature"]);
    expect(groups.find((g) => g.label === "Artifact")?.entries.map((e) => e.card.name)).toEqual(["Sol Ring", "Gruul Signet"]);
  });
});

describe("groupAndSort: mana value", () => {
  it("buckets by mana value with 7+ collected, and lands on their own at the end", () => {
    const groups = groupAndSort(deck, { key: "cmc", descending: false });
    expect(labels(groups)).toEqual(["1 mana", "2 mana", "3 mana", "4 mana", "7+ mana", "Lands"]);
    expect(groups[0].entries.map((e) => e.card.name)).toEqual(["Bolt", "Llanowar Elves", "Sol Ring"]);
    expect(groups.find((g) => g.label === "7+ mana")?.entries.map((e) => e.card.name)).toEqual(["Mystery Card"]);
  });

  it("starts with the most expensive when descending", () => {
    expect(labels(groupAndSort(deck, { key: "cmc", descending: true }))[0]).toBe("Lands");
    expect(labels(groupAndSort(deck, { key: "cmc", descending: true }))[1]).toBe("7+ mana");
  });
});

describe("groupAndSort: color", () => {
  it("groups white-blue-black-red-green, then multicolor, colorless and lands", () => {
    const groups = groupAndSort(deck, { key: "color", descending: false });
    expect(labels(groups)).toEqual(["Red", "Green", "Multicolor", "Colorless", "Lands"]);
    expect(groups.find((g) => g.label === "Multicolor")?.entries.map((e) => e.card.name)).toEqual(["Xenagos"]);
    expect(groups.find((g) => g.label === "Colorless")?.entries.map((e) => e.card.name)).toEqual(["Gruul Signet", "Mystery Card", "Sol Ring"]);
  });

  it("falls back to color identity when a double-faced card has no top-level colors", () => {
    const dfc = entry({ name: "Two Faced", type: "Creature // Land", colors: [] });
    (dfc.card as { colors?: string[] }).colors = undefined;
    (dfc.card as { color_identity: string[] }).color_identity = ["U"];
    expect(labels(groupAndSort([dfc], { key: "color", descending: false }))).toEqual(["Blue"]);
  });
});

describe("groupAndSort: highlight", () => {
  it("lists owned, then missing, then the rest", () => {
    const groups = groupAndSort(deck, { key: "highlight", descending: false });
    expect(labels(groups)).toEqual(["Owned (yellow)", "Missing (red)", "Not highlighted"]);
    expect(groups[0].entries.map((e) => e.card.name)).toEqual(["Xenagos"]);
    expect(groups[1].entries.map((e) => e.card.name)).toEqual(["Mystery Card"]);
    expect(groups[2].entries).toHaveLength(6);
  });

  it("puts the not-highlighted cards first when reversed", () => {
    expect(labels(groupAndSort(deck, { key: "highlight", descending: true }))[0]).toBe("Not highlighted");
  });
});

describe("groupAndSort: flat sorts", () => {
  it("name: A to Z, or Z to A", () => {
    expect(names(groupAndSort(deck, { key: "name", descending: false }))[0]).toBe("Bolt");
    expect(names(groupAndSort(deck, { key: "name", descending: true }))[0]).toBe("Xenagos");
    expect(groupAndSort(deck, { key: "name", descending: false })[0].label).toBeNull();
  });

  it("price: highest first by default, unpriced cards always last", () => {
    expect(sortFor("price").descending).toBe(true);
    const high = names(groupAndSort(deck, sortFor("price")));
    expect(high.slice(0, 3)).toEqual(["Xenagos", "Sol Ring", "Bolt"]);
    expect(high.at(-1)).toBe("Mystery Card");
    const low = names(groupAndSort(deck, { key: "price", descending: false }));
    expect(low.slice(0, 2)).toEqual(["Command Tower", "Gruul Signet"]);
    expect(low.at(-1)).toBe("Mystery Card");
  });

  it("popularity: most played first, unranked last", () => {
    const list = names(groupAndSort(deck, { key: "popularity", descending: false }));
    expect(list.slice(0, 3)).toEqual(["Sol Ring", "Command Tower", "Bolt"]);
    expect(list.slice(-2).sort()).toEqual(["Gruul Signet", "Mystery Card"]);
    expect(names(groupAndSort(deck, { key: "popularity", descending: true }))[0]).toBe("Xenagos");
  });

  it("breaks ties by name so the order never jumps around", () => {
    const tied = [entry({ name: "Zed", usd: 2 }), entry({ name: "Abe", usd: 2 }), entry({ name: "Moe", usd: 2 })];
    expect(names(groupAndSort(tied, { key: "price", descending: false }))).toEqual(["Abe", "Moe", "Zed"]);
  });
});

describe("general behaviour", () => {
  it("never loses or duplicates a card, whatever the sort", () => {
    for (const key of SORT_KEYS) {
      for (const descending of [false, true]) {
        const result = names(groupAndSort(deck, { key, descending }));
        expect(result.sort(), `${key} ${descending}`).toEqual(deck.map((e) => e.card.name).sort());
      }
    }
  });

  it("does not change the list it was given", () => {
    const before = deck.map((e) => e.card.name);
    for (const key of SORT_KEYS) groupAndSort(deck, { key, descending: true });
    expect(deck.map((e) => e.card.name)).toEqual(before);
  });

  it("returns no groups for an empty list", () => {
    expect(groupAndSort([], DEFAULT_SORT)).toEqual([]);
  });

  it("keeps a card type it doesn't know instead of dropping it", () => {
    const odd = entry({ name: "Odd Thing", type: "Scheme" });
    expect(names(groupAndSort([odd], DEFAULT_SORT))).toEqual(["Odd Thing"]);
  });
});

describe("saved settings and labels", () => {
  it("accepts valid saved sorts and falls back to the default for anything else", () => {
    expect(parseSort({ key: "price", descending: true })).toEqual({ key: "price", descending: true });
    expect(parseSort({ key: "cmc" })).toEqual({ key: "cmc", descending: false });
    for (const bad of [null, undefined, "price", 5, { key: "nope" }, { descending: true }, []]) expect(parseSort(bad)).toEqual(DEFAULT_SORT);
  });

  it("has a readable direction label for every sort and direction", () => {
    for (const key of SORT_KEYS as readonly SortKey[]) {
      for (const descending of [false, true]) expect(directionLabel({ key, descending }).length).toBeGreaterThan(2);
    }
    expect(directionLabel({ key: "name", descending: false })).toBe("A → Z");
    expect(directionLabel({ key: "price", descending: true })).toBe("Highest first");
  });
});
