import { describe, expect, it } from "vitest";
import { slimCard } from "./slim-card";
import type { ScryfallCard } from "./scryfall-types";

// What Scryfall really sends has far more than the app reads.
const raw = {
  id: "abc",
  oracle_id: "oracle",
  name: "Sol Ring",
  lang: "en",
  layout: "normal",
  cmc: 1,
  mana_cost: "{1}",
  type_line: "Artifact",
  color_identity: [],
  legalities: { commander: "legal" },
  set: "cmm",
  image_uris: { small: "s", normal: "n", png: "p" },
  prices: { usd: "1.50", eur: null },
  edhrec_rank: 1,
  // none of these is read by the app:
  purchase_uris: { tcgplayer: "https://example.test/buy" },
  related_uris: { gatherer: "https://example.test/g" },
  rulings_uri: "https://example.test/rulings",
  tcgplayer_id: 123,
  artist: "Mark Tedin",
  frame_effects: ["legendary"],
  finishes: ["nonfoil"],
} as unknown as ScryfallCard;

describe("slimCard", () => {
  it("keeps the fields the app reads, untouched", () => {
    const slim = slimCard(raw);
    expect(slim).toMatchObject({ id: "abc", name: "Sol Ring", cmc: 1, set: "cmm", prices: { usd: "1.50", eur: null }, image_uris: { small: "s", normal: "n", png: "p" }, edhrec_rank: 1 });
    expect(slim.legalities).toEqual({ commander: "legal" });
  });

  it("drops everything else Scryfall sends", () => {
    const slim = slimCard(raw) as unknown as Record<string, unknown>;
    for (const key of ["purchase_uris", "related_uris", "rulings_uri", "tcgplayer_id", "artist", "frame_effects", "finishes"]) expect(slim).not.toHaveProperty(key);
  });

  it("doesn't invent fields a card doesn't have", () => {
    expect(Object.keys(slimCard(raw))).not.toContain("oracle_text");
    expect(Object.keys(slimCard(raw))).not.toContain("card_faces");
  });

  it("trims each face of a double-faced card the same way", () => {
    const dfc = { ...raw, card_faces: [{ name: "Front", mana_cost: "{1}", image_uris: { normal: "f" }, artist: "x", illustration_id: "y" }] } as unknown as ScryfallCard;
    expect(slimCard(dfc).card_faces).toEqual([{ name: "Front", mana_cost: "{1}", image_uris: { normal: "f" } }]);
  });

  it("is much smaller than what Scryfall sends", () => {
    expect(JSON.stringify(slimCard(raw)).length).toBeLessThan(JSON.stringify(raw).length * 0.8);
  });
});
