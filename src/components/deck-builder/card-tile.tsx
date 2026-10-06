"use client";

import { cardImageUrl } from "@/lib/card-helpers";
import { HoverPreview } from "./card-hover-name";
import type { ScryfallCard } from "./types";

// Full-width, always-visible buttons that read clearly on both themes. The
// primary one is the main action (Add / Set commander); secondary is the softer
// alternative (Maybe).
export function tileButtonClass(variant: "primary" | "secondary"): string {
  const base = "w-full rounded-md px-2 py-1.5 text-xs font-semibold transition disabled:opacity-50";
  return variant === "primary"
    ? `${base} bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/85`
    : `${base} border border-black/25 text-black/80 hover:bg-black/5 dark:border-white/30 dark:text-white/85 dark:hover:bg-white/10`;
}

export function CardTile({ card, actions }: { card: ScryfallCard; actions?: React.ReactNode }) {
  const img = cardImageUrl(card, "small");
  return (
    <HoverPreview
      as="div"
      placement="beside"
      imageUri={cardImageUrl(card, "normal")}
      alt={card.name}
      className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]"
    >
      <div className="aspect-[5/7] w-full bg-black/5 dark:bg-white/5">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={card.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-black/40 dark:text-white/40">{card.name}</div>
        )}
      </div>
      {actions && <div className="flex flex-col gap-1 p-1">{actions}</div>}
    </HoverPreview>
  );
}
