export type DeckZone = "commander" | "mainboard" | "maybeboard";

export interface ParsedLine {
  quantity: number;
  name: string;
  zone: DeckZone;
}

const SECTION_HEADERS: Record<string, DeckZone> = {
  commander: "commander",
  commanders: "commander",
  deck: "mainboard",
  mainboard: "mainboard",
  maindeck: "mainboard",
  library: "mainboard",
  maybeboard: "maybeboard",
  maybe: "maybeboard",
  sideboard: "maybeboard",
};

// Matches "2x Sol Ring", "2 Sol Ring", or plain "Sol Ring", optionally
// followed by set/collector annotations like "(LTC) 25" or "[LTC:25]" that
// exports from Moxfield/Archidekt/MTGGoldfish tack on.
const LINE_RE = /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s*[([][A-Za-z0-9]{2,6}[)\]](?:\s*[\dA-Za-z-]+)?)?\s*$/;

export function parseDecklist(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  let zone: DeckZone = "mainboard";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const headerKey = line.replace(/:$/, "").toLowerCase();
    if (headerKey in SECTION_HEADERS) {
      zone = SECTION_HEADERS[headerKey];
      continue;
    }

    let body = line;
    let lineZone = zone;
    const sbPrefix = body.match(/^SB:\s*(.*)$/i);
    if (sbPrefix) {
      body = sbPrefix[1];
      lineZone = "maybeboard";
    }
    const commanderPrefix = body.match(/^Commander:\s*(.*)$/i);
    if (commanderPrefix) {
      body = commanderPrefix[1];
      lineZone = "commander";
    }

    const match = body.match(LINE_RE);
    if (!match) continue;
    const quantity = match[1] ? parseInt(match[1], 10) : 1;
    const name = match[2].trim();
    if (!name) continue;

    lines.push({ quantity, name, zone: lineZone });
  }

  return lines;
}
