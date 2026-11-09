import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "./scryfall-types";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  executeRaw: vi.fn(),
  searchFind: vi.fn(),
  searchUpsert: vi.fn(),
  searchCards: vi.fn(),
  getCardsCollection: vi.fn(),
  getCardByNameFuzzy: vi.fn(),
  cardFindFirst: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./scryfall", () => ({ searchCards: mocks.searchCards, getCardsCollection: mocks.getCardsCollection, getCardByNameFuzzy: mocks.getCardByNameFuzzy }));
vi.mock("./prisma", () => ({
  prisma: { $executeRaw: mocks.executeRaw, searchCache: { findUnique: mocks.searchFind, upsert: mocks.searchUpsert }, cardCache: { findMany: vi.fn(), findFirst: mocks.cardFindFirst } },
}));

import { resolveCardsByNames, searchAndCacheCards } from "./cards";

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, name: `Card ${i}` }) as ScryfallCard);
const answer = (data: ScryfallCard[]) => ({ object: "list", has_more: false, total_cards: data.length, data });

describe("searchAndCacheCards on a miss", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.searchFind.mockResolvedValue(null);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.searchUpsert.mockResolvedValue({});
  });

  it("answers before anything is written, then remembers it after the response", async () => {
    mocks.searchCards.mockResolvedValue(answer(cards(3)));
    let later: (() => Promise<unknown>) | undefined;
    mocks.after.mockImplementation((task) => void (later = task));

    const result = await searchAndCacheCards("sol ring");
    expect(result.cards).toHaveLength(3);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.searchUpsert).not.toHaveBeenCalled();

    await later!();
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.searchUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.searchUpsert.mock.calls[0][0].create.cardIds).toEqual(["id-0", "id-1", "id-2"]);
  });

  it("writes a page of cards in a few multi-row statements, not one per card", async () => {
    mocks.searchCards.mockResolvedValue(answer([...cards(120), cards(1)[0]])); // 121 results, one a repeat of id-0
    mocks.after.mockImplementation((task) => void task());
    await searchAndCacheCards("t:artifact");
    await vi.waitFor(() => expect(mocks.searchUpsert).toHaveBeenCalled());
    expect(mocks.executeRaw).toHaveBeenCalledTimes(3); // 50 + 50 + 20 unique cards
    const ids = mocks.executeRaw.mock.calls.map((call) => call[1] as string[]);
    expect(ids.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(new Set(ids.flat()).size).toBe(120);
  });

  it("outside a request (where there is nothing to run after) writes before returning", async () => {
    mocks.searchCards.mockResolvedValue(answer(cards(2)));
    mocks.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    await searchAndCacheCards("sol ring");
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.searchUpsert).toHaveBeenCalledTimes(1);
  });

  it("a failed cache write never breaks the search", async () => {
    mocks.searchCards.mockResolvedValue(answer(cards(2)));
    mocks.executeRaw.mockRejectedValue(new Error("database is down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let later: (() => Promise<unknown>) | undefined;
    mocks.after.mockImplementation((task) => void (later = task));

    const result = await searchAndCacheCards("sol ring");
    expect(result.cards).toHaveLength(2);
    await expect(later!()).resolves.toBeUndefined();
    expect(mocks.searchUpsert).not.toHaveBeenCalled(); // the search is only remembered if its cards were
    log.mockRestore();
  });
});

const named = (name: string, faces: string[] = []) =>
  ({ id: `id-${name}`, name, card_faces: faces.map((face) => ({ name: face })) }) as unknown as ScryfallCard;
const delver = named("Delver of Secrets // Insectile Aberration", ["Delver of Secrets", "Insectile Aberration"]);
const valki = named("Valki, God of Lies // Tibalt, Cosmic Impostor", ["Valki, God of Lies", "Tibalt, Cosmic Impostor"]);
const fireIce = named("Fire // Ice", ["Fire", "Ice"]);
const solRing = named("Sol Ring");

describe("resolveCardsByNames", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.executeRaw.mockResolvedValue(1);
    mocks.cardFindFirst.mockResolvedValue(null);
    mocks.getCardByNameFuzzy.mockResolvedValue(null);
  });

  const collection = (found: ScryfallCard[], notFound: string[] = []) =>
    mocks.getCardsCollection.mockResolvedValue({ found, notFound: notFound.map((name) => ({ name })) });

  it("finds a double-faced card named by its front face alone, under the name as typed", async () => {
    collection([delver, valki]);
    const { resolved, unresolved } = await resolveCardsByNames(["Delver of Secrets", "Valki, God of Lies"]);
    expect(resolved.get("Delver of Secrets")).toBe(delver);
    expect(resolved.get("Valki, God of Lies")).toBe(valki);
    expect(unresolved).toEqual([]);
    expect(mocks.getCardByNameFuzzy).not.toHaveBeenCalled();
  });

  it("still finds a card named by its full name", async () => {
    collection([delver]);
    const { resolved, unresolved } = await resolveCardsByNames(["Delver of Secrets // Insectile Aberration"]);
    expect(resolved.get("Delver of Secrets // Insectile Aberration")).toBe(delver);
    expect(unresolved).toEqual([]);
  });

  it("still finds an ordinary single-faced card, whatever the capitals", async () => {
    collection([solRing]);
    const { resolved, unresolved } = await resolveCardsByNames(["Sol Ring", "sol ring"]);
    expect(resolved.get("Sol Ring")).toBe(solRing);
    expect(resolved.get("sol ring")).toBe(solRing);
    expect(unresolved).toEqual([]);
  });

  it("finds a card named by its back face, and by every way of writing the same card at once", async () => {
    collection([delver]);
    const typed = ["Delver of Secrets", "delver of secrets", "Insectile Aberration", "Delver of Secrets // Insectile Aberration"];
    const { resolved, unresolved } = await resolveCardsByNames(typed);
    expect(typed.map((name) => resolved.get(name))).toEqual([delver, delver, delver, delver]);
    expect(unresolved).toEqual([]);
  });

  it("finds a split card written with a single slash, and asks Scryfall for it with the usual two", async () => {
    collection([fireIce]);
    const { resolved, unresolved } = await resolveCardsByNames(["Fire/Ice", "Fire / Ice", "Fire // Ice"]);
    expect(resolved.get("Fire/Ice")).toBe(fireIce);
    expect(resolved.get("Fire / Ice")).toBe(fireIce);
    expect(resolved.get("Fire // Ice")).toBe(fireIce);
    expect(unresolved).toEqual([]);
    expect(mocks.getCardsCollection).toHaveBeenCalledWith([{ name: "Fire // Ice" }]);
  });

  it("finds a card Scryfall returns with accents the name didn't have", async () => {
    const grunt = named("Jötun Grunt");
    collection([grunt]);
    const { resolved } = await resolveCardsByNames(["Jotun Grunt"]);
    expect(resolved.get("Jotun Grunt")).toBe(grunt);
  });

  it("a face name never takes the place of a card that has that exact name", async () => {
    const plainFire = named("Fire");
    collection([fireIce, plainFire]);
    const { resolved } = await resolveCardsByNames(["Fire", "Ice"]);
    expect(resolved.get("Fire")).toBe(plainFire);
    expect(resolved.get("Ice")).toBe(fireIce);
  });

  it("reports a name Scryfall doesn't know, and keeps the cards it does", async () => {
    collection([solRing, delver], ["Not A Real Card"]);
    const { resolved, unresolved } = await resolveCardsByNames(["Sol Ring", "Delver of Secrets", "Not A Real Card"]);
    expect([...resolved.keys()]).toEqual(["Sol Ring", "Delver of Secrets"]);
    expect(unresolved).toEqual(["Not A Real Card"]);
    expect(mocks.getCardByNameFuzzy).toHaveBeenCalledWith("Not A Real Card");
  });

  it("falls back to a fuzzy search for a typo, under the name as typed", async () => {
    collection([], ["Soll Ring"]);
    mocks.getCardByNameFuzzy.mockResolvedValue(solRing);
    const { resolved, unresolved } = await resolveCardsByNames(["Soll Ring"]);
    expect(resolved.get("Soll Ring")).toBe(solRing);
    expect(unresolved).toEqual([]);
  });

  it("never leaves a name out: one Scryfall neither returned nor reported as missing is still reported", async () => {
    collection([solRing]); // nothing in notFound for "Mystery Card"
    const { resolved, unresolved } = await resolveCardsByNames(["Sol Ring", "Mystery Card"]);
    expect([...resolved.keys()]).toEqual(["Sol Ring"]);
    expect(unresolved).toEqual(["Mystery Card"]);
  });
});
