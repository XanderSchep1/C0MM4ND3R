import type { ScryfallCard } from "./scryfall-types";

// Scryfall sends about 5 KB per card; the app reads about a third of it. Search results (up to 175 cards a
// page) go to the browser trimmed to the fields ScryfallCard declares, which is everything the app reads.
const CARD_KEYS = [
  "id",
  "oracle_id",
  "name",
  "lang",
  "released_at",
  "layout",
  "mana_cost",
  "cmc",
  "type_line",
  "oracle_text",
  "colors",
  "color_identity",
  "keywords",
  "power",
  "toughness",
  "loyalty",
  "legalities",
  "game_changer",
  "set",
  "set_name",
  "collector_number",
  "rarity",
  "image_uris",
  "card_faces",
  "prices",
  "edhrec_rank",
  "reprint",
  "scryfall_uri",
  "produced_mana",
] as const satisfies readonly (keyof ScryfallCard)[];

// Compile-time guard: adding a field to ScryfallCard without listing it above is a type error here, so a
// field the app starts reading can never be silently missing from search results.
type MissingKeys = Exclude<keyof ScryfallCard, (typeof CARD_KEYS)[number]>;
const everyFieldIsKept: [MissingKeys] extends [never] ? true : never = true;
void everyFieldIsKept;

const FACE_KEYS = ["name", "mana_cost", "type_line", "oracle_text", "colors", "power", "toughness", "loyalty", "image_uris"] as const;

function pick<T extends object>(source: T, keys: readonly (keyof T)[]): T {
  const out: Partial<T> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out as T;
}

export function slimCard(card: ScryfallCard): ScryfallCard {
  const slim = pick(card, CARD_KEYS);
  if (card.card_faces) slim.card_faces = card.card_faces.map((face) => pick(face, FACE_KEYS));
  return slim;
}
