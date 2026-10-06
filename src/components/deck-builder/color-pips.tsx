"use client";

// Real Scryfall mana symbols (same unrated *.scryfall.io file origin used by
// ManaCost) rather than a custom-styled circle, so color identity reads with
// the same iconography as every mana cost shown elsewhere in the app.
function symbolSrc(symbol: string): string {
  return `https://svgs.scryfall.io/card-symbols/${symbol}.svg`;
}

export function ColorPips({ identity }: { identity: string[] }) {
  const symbols = identity.length > 0 ? identity : ["C"];
  return (
    <span className="flex items-center gap-1">
      {symbols.map((c) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={c} src={symbolSrc(c)} alt={c} className="h-5 w-5" />
      ))}
    </span>
  );
}
