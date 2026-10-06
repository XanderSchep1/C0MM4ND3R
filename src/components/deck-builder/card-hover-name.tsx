"use client";

import { useState } from "react";
import { cardImageUrl } from "@/lib/card-helpers";
import type { ScryfallCard } from "./types";

// Wraps plain card-name text (decklists, combo pieces, salt flags — anywhere
// a card shows up as text rather than an image tile) with a hover preview of
// the full card image, so you don't have to re-search a name to see the card.
export function NameWithPreview({ name, imageUri, className }: { name: string; imageUri?: string; className?: string }) {
  const [hover, setHover] = useState(false);

  return (
    <span className={`relative ${className ?? ""}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="cursor-default underline decoration-dotted decoration-black/20 underline-offset-2 dark:decoration-white/20">{name}</span>
      {hover && imageUri && (
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUri} alt={name} className="w-48 rounded-lg shadow-xl ring-1 ring-black/10 dark:ring-white/10" />
        </span>
      )}
    </span>
  );
}

export function CardHoverName({ card, className }: { card: ScryfallCard; className?: string }) {
  return <NameWithPreview name={card.name} imageUri={cardImageUrl(card, "normal")} className={className} />;
}
