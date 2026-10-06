"use client";

import { useState, type ElementType, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cardImageUrl } from "@/lib/card-helpers";
import type { ScryfallCard } from "./types";

const PREVIEW_WIDTH = 260;
const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * 7) / 5);
const CURSOR_OFFSET = 18;
const BESIDE_GAP = 16;
const EDGE_MARGIN = 8;

type Point = { left: number; top: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// "cursor": floats next to the mouse (for card names inside text, where there is
//   no row to dock beside).
// "beside": docked in one steady spot next to the hovered row — or next to the
//   enclosing [data-preview-anchor] element (a whole column) when there is one,
//   so it doesn't cover neighboring tiles — vertically centered in the window,
//   on whichever side has room. Hidden when neither side has room (narrow,
//   stacked layouts).
function place(mode: "cursor" | "beside", e: PointerEvent): Point | null {
  const centeredTop = clamp((window.innerHeight - PREVIEW_HEIGHT) / 2, EDGE_MARGIN, window.innerHeight - PREVIEW_HEIGHT - EDGE_MARGIN);

  if (mode === "cursor") {
    const fitsRight = e.clientX + CURSOR_OFFSET + PREVIEW_WIDTH <= window.innerWidth - EDGE_MARGIN;
    return {
      left: fitsRight ? e.clientX + CURSOR_OFFSET : Math.max(EDGE_MARGIN, e.clientX - CURSOR_OFFSET - PREVIEW_WIDTH),
      top: clamp(e.clientY - PREVIEW_HEIGHT / 2, EDGE_MARGIN, window.innerHeight - PREVIEW_HEIGHT - EDGE_MARGIN),
    };
  }

  const anchor = e.currentTarget.closest("[data-preview-anchor]") ?? e.currentTarget;
  const rect = anchor.getBoundingClientRect();
  if (rect.left - BESIDE_GAP - PREVIEW_WIDTH >= EDGE_MARGIN) return { left: rect.left - BESIDE_GAP - PREVIEW_WIDTH, top: centeredTop };
  if (window.innerWidth - rect.right - BESIDE_GAP - PREVIEW_WIDTH >= EDGE_MARGIN) return { left: rect.right + BESIDE_GAP, top: centeredTop };
  return null;
}

// Shows the full card image while hovering anything inside `children`. The image
// is portaled to <body> with fixed positioning, so rows that clip their overflow
// (truncated names, scroll areas) can't cut it off. Mouse only — touch has no
// hover.
export function HoverPreview({
  imageUri,
  alt,
  as: Tag = "span",
  placement = "cursor",
  className,
  children,
}: {
  imageUri?: string;
  alt: string;
  as?: ElementType;
  placement?: "cursor" | "beside";
  className?: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<Point | null>(null);

  function track(e: PointerEvent) {
    if (e.pointerType !== "mouse" || !imageUri) return;
    const next = place(placement, e);
    setPos((prev) => (prev && next && prev.left === next.left && prev.top === next.top ? prev : next));
  }

  return (
    <Tag className={className} onPointerEnter={track} onPointerMove={track} onPointerLeave={() => setPos(null)}>
      {children}
      {pos &&
        imageUri &&
        createPortal(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUri}
            alt={alt}
            width={PREVIEW_WIDTH}
            height={PREVIEW_HEIGHT}
            style={{ left: pos.left, top: pos.top, width: PREVIEW_WIDTH }}
            className="pointer-events-none fixed z-50 rounded-xl shadow-2xl ring-1 ring-black/20 dark:ring-white/20"
          />,
          document.body
        )}
    </Tag>
  );
}

const NAME_STYLE = "cursor-default underline decoration-dotted decoration-black/20 underline-offset-2 dark:decoration-white/20";

// Plain card-name text (combo pieces, salt flags — anywhere a card appears as
// text rather than an image tile) with the hover preview.
export function NameWithPreview({ name, imageUri, className }: { name: string; imageUri?: string; className?: string }) {
  return (
    <HoverPreview imageUri={imageUri} alt={name} className={className}>
      <span className={NAME_STYLE}>{name}</span>
    </HoverPreview>
  );
}

export function CardHoverName({ card, className }: { card: ScryfallCard; className?: string }) {
  return <NameWithPreview name={card.name} imageUri={cardImageUrl(card, "normal")} className={className} />;
}

// Name text for rows that are already wrapped in a HoverPreview themselves.
export function CardNameText({ name, className }: { name: string; className?: string }) {
  return <span className={`${NAME_STYLE} ${className ?? ""}`}>{name}</span>;
}
