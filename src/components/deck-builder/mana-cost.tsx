"use client";

// Scryfall hosts individual mana symbol SVGs at the unrated *.scryfall.io
// file origin (no rate limit) — the filename is just the symbol with its
// braces and internal slashes stripped, e.g. {2/W} -> 2W.svg, {W/P} -> WP.svg.
function symbolSrc(symbol: string): string {
  return `https://svgs.scryfall.io/card-symbols/${symbol.replace(/\//g, "")}.svg`;
}

export function ManaCost({ cost }: { cost: string }) {
  const symbols = cost.match(/\{[^}]+\}/g);
  if (!symbols?.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {symbols.map((s, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={symbolSrc(s.slice(1, -1))} alt={s} className="h-3.5 w-3.5" />
      ))}
    </span>
  );
}
