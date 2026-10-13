import { colorIdentityUnion } from "./card-helpers";
import type { ScryfallCard } from "./scryfall-types";

// Search answers are kept in the browser for a day. For a deck's card search the answer depends on the
// commander's colours, so the browser sends the colours it believes the deck has, and the server only
// lets the answer be kept when its own view of the deck agrees (see the search route). Bump the version
// whenever the shape of the answer changes, so cached answers in the browser stop being used.
export const SEARCH_CACHE_VERSION = "1";

// "none" = no commander yet (no colour limit), "c" = colourless commander, otherwise e.g. "BG".
export function searchScope(commanders: ScryfallCard[]): string {
  if (commanders.length === 0) return "none";
  return colorIdentityUnion(commanders).join("") || "c";
}
