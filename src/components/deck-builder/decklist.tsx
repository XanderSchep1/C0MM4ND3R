"use client";

import { useEffect, useRef, useState } from "react";
import { cardImageUrl, cardManaCost, formatPrice } from "@/lib/card-helpers";
import type { CardMark } from "@/lib/card-mark";
import { nextMark } from "@/lib/deck-edits";
import { groupAndSort, type SortState } from "@/lib/deck-sort";
import { CardNameText, HoverPreview } from "./card-hover-name";
import { ManaCost } from "./mana-cost";
import { useCollection } from "./collection";
import type { DeckCardEntry, DeckZone } from "./types";

// Yellow = "I own this card", red = "I don't have it yet". Colours are fixed so the
// row tint, the button and the legend always match.
const MARKS: { mark: CardMark; label: string; swatch: string; row: string }[] = [
  { mark: "owned", label: "Owned", swatch: "bg-[#f5c518]", row: "bg-[#f5c518]/25 dark:bg-[#f5c518]/20" },
  { mark: "missing", label: "Missing", swatch: "bg-[#e0342b]", row: "bg-[#e0342b]/15 dark:bg-[#e0342b]/25" },
];

const SMALL_BUTTON = "h-6 w-6 rounded border border-black/15 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10";

interface Props {
  entries: DeckCardEntry[];
  sort: SortState;
  onQuantityChange: (scryfallId: string, quantity: number) => void;
  onRemove: (scryfallId: string) => void;
  onMove: (scryfallId: string, newZone: DeckZone) => void;
  onMark: (scryfallId: string, mark: CardMark | null) => void;
  moveTargets: { zone: DeckZone; label: string }[];
}

// One button that steps through no highlight -> yellow (owned) -> red (missing) -> none.
function HighlightButton({ name, mark, onChange }: { name: string; mark: CardMark | null | undefined; onChange: (mark: CardMark | null) => void }) {
  const next = nextMark(mark);
  const state = mark === "owned" ? "yellow, owned" : mark === "missing" ? "red, missing" : "not highlighted";
  const hint =
    mark === "owned"
      ? "Yellow: I own it. Click for red (I don't have it)"
      : mark === "missing"
        ? "Red: I don't have it. Click to clear"
        : "Highlight: click once for yellow (I own it), again for red (I don't have it)";
  return (
    <button
      onClick={() => onChange(next)}
      title={hint}
      aria-label={`Highlight ${name}: currently ${state}. ${hint}`}
      className={`flex h-6 w-6 items-center justify-center rounded border ${
        mark === "owned"
          ? "border-black/30 bg-[#f5c518] dark:border-white/40"
          : mark === "missing"
            ? "border-black/30 bg-[#e0342b] dark:border-white/40"
            : "border-black/20 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
      }`}
    >
      {mark === "owned" ? (
        <span className="text-xs font-bold leading-none text-black">✓</span>
      ) : mark === "missing" ? (
        <span className="text-xs font-bold leading-none text-white">!</span>
      ) : (
        <span className="h-3 w-3 rounded-full bg-[linear-gradient(90deg,#f5c518_50%,#e0342b_50%)]" />
      )}
    </button>
  );
}

// The less common actions, tucked behind one always-visible button so each line stays calm.
function RowMenu({ name, items }: { name: string; items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    buttons[(at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${name}`}
        title="More actions"
        className={`${SMALL_BUTTON} font-bold leading-none ${open ? "bg-black/10 dark:bg-white/15" : ""}`}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 min-w-44 overflow-hidden rounded-md border border-black/15 bg-white py-1 text-sm shadow-lg dark:border-white/20 dark:bg-neutral-900"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Decklist({ entries, sort, onQuantityChange, onRemove, onMove, onMark, moveTargets }: Props) {
  const { unique, owned } = useCollection();
  if (entries.length === 0) {
    return <p className="text-sm text-black/40 dark:text-white/40">No cards here yet.</p>;
  }

  const groups = groupAndSort(entries, sort);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-black/50 dark:text-white/50">
        <span>Highlight button on each line: once = yellow, twice = red.</span>
        {MARKS.map(({ mark, label, swatch }) => (
          <span key={mark} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-full ${swatch}`} aria-hidden="true" />
            {label} · {entries.filter((e) => e.mark === mark).length}
          </span>
        ))}
      </div>
      {groups.map((group) => (
        <div key={group.key}>
          {group.label !== null && (
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
              {group.label} ({group.entries.reduce((sum, e) => sum + e.quantity, 0)})
            </div>
          )}
          <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {group.entries.map((entry) => {
              const card = entry.card;
              const rowTint = MARKS.find((m) => m.mark === entry.mark)?.row;
              return (
                <HoverPreview
                  as="li"
                  placement="beside"
                  key={card.id}
                  imageUri={cardImageUrl(card, "normal")}
                  alt={card.name}
                  price={formatPrice(card)}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded px-1 py-1.5 text-sm ${rowTint ?? "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"}`}
                >
                  <span className="w-6 shrink-0 text-right tabular-nums text-black/50 dark:text-white/50">{entry.quantity}×</span>
                  <CardNameText name={card.name} className="min-w-[8.5rem] flex-1 truncate" />
                  {!entry.mark && unique > 0 && owned(card) < entry.quantity && (
                    <span className="shrink-0 rounded bg-[#fab219]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#8a5a00] dark:text-[#fab219]" title="Not in your collection">
                      Need
                    </span>
                  )}
                  <span className="shrink-0">
                    <ManaCost cost={cardManaCost(card)} />
                  </span>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <HighlightButton name={card.name} mark={entry.mark} onChange={(mark) => onMark(card.id, mark)} />
                    <button
                      onClick={() => onQuantityChange(card.id, entry.quantity - 1)}
                      className={SMALL_BUTTON}
                      aria-label={entry.quantity <= 1 ? `Remove ${card.name}` : `Remove one ${card.name}`}
                    >
                      −
                    </button>
                    <button onClick={() => onQuantityChange(card.id, entry.quantity + 1)} className={SMALL_BUTTON} aria-label={`Add one ${card.name}`}>
                      +
                    </button>
                    <RowMenu
                      name={card.name}
                      items={[...moveTargets.map((t) => ({ label: t.label, onSelect: () => onMove(card.id, t.zone) })), { label: "Remove from deck", onSelect: () => onRemove(card.id) }]}
                    />
                  </div>
                </HoverPreview>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
