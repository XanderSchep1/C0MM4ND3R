// Pragmatic subset of the Scryfall Card object — only the fields this app
// actually reads. See https://scryfall.com/docs/api/cards for the full shape.
export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: Record<string, string>;
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  released_at?: string;
  layout: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  keywords?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  legalities: Record<string, "legal" | "not_legal" | "restricted" | "banned">;
  // Scryfall's own flag for the WotC "Commander Game Changers" list — cards
  // strong/warping enough that their presence is a signal for deck power
  // level. See https://scryfall.com/docs/syntax (is:gamechanger).
  game_changer?: boolean;
  set: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  image_uris?: Record<string, string>;
  card_faces?: ScryfallCardFace[];
  prices?: Record<string, string | null>;
  edhrec_rank?: number;
  reprint?: boolean;
  scryfall_uri?: string;
  produced_mana?: string[];
}

export interface ScryfallList<T> {
  object: "list";
  total_cards?: number;
  has_more: boolean;
  next_page?: string;
  data: T[];
  warnings?: string[];
}

export interface ScryfallError {
  object: "error";
  status: number;
  code: string;
  details: string;
  warnings?: string[];
}

export interface ScryfallSet {
  code: string;
  name: string;
  released_at?: string;
  set_type: string;
  card_count: number;
  digital: boolean;
  icon_svg_uri?: string;
}
