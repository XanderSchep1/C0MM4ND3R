"use client";

import { useState } from "react";
import { cardImageUrl, formatPrice, primaryTypeCategory } from "@/lib/card-helpers";
import { HoverPreview } from "./card-hover-name";
import type { DeckCardEntry, ScryfallCard } from "./types";

const HAND_SIZE = 7;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const isLand = (c: ScryfallCard) => primaryTypeCategory(c) === "Land";

// A rough "would I keep this?" read, using the usual rules of thumb: 2–5 lands
// and at least one cheap play.
function keepVerdict(hand: ScryfallCard[]): { label: string; good: boolean; detail: string } {
  const lands = hand.filter(isLand).length;
  const cheapSpells = hand.filter((c) => !isLand(c) && c.cmc <= 3).length;
  if (lands < 2) return { label: "Risky", good: false, detail: `Only ${lands} land${lands === 1 ? "" : "s"} — likely to stumble on mana.` };
  if (lands > 5) return { label: "Risky", good: false, detail: `${lands} lands — flooding, few real plays.` };
  if (cheapSpells === 0) return { label: "Slow", good: false, detail: "Good mana but nothing cheap to cast early." };
  return { label: "Looks keepable", good: true, detail: `${lands} lands and ${cheapSpells} cheap spell${cheapSpells === 1 ? "" : "s"}.` };
}

export function PlaytestPanel({ commanders, mainboard }: { commanders: DeckCardEntry[]; mainboard: DeckCardEntry[] }) {
  const [library, setLibrary] = useState<ScryfallCard[]>([]);
  const [hand, setHand] = useState<ScryfallCard[]>([]);
  const [turn, setTurn] = useState(0);
  const [mulligans, setMulligans] = useState(0);
  const [started, setStarted] = useState(false);
  const [pendingBottom, setPendingBottom] = useState(0);

  const deckSize = mainboard.reduce((sum, e) => sum + e.quantity, 0);
  const bottoming = started && pendingBottom > 0;

  function deal(nextMulligans: number) {
    const deck = shuffled(mainboard.flatMap((e) => Array<ScryfallCard>(e.quantity).fill(e.card)));
    setHand(deck.slice(0, HAND_SIZE));
    setLibrary(deck.slice(HAND_SIZE));
    setMulligans(nextMulligans);
    // The first mulligan is free in Commander; each one after puts a card on the bottom (London mulligan).
    setPendingBottom(Math.max(0, nextMulligans - 1));
    setTurn(0);
    setStarted(true);
  }

  function bottomCard(index: number) {
    const card = hand[index];
    setHand((h) => h.filter((_, i) => i !== index));
    setLibrary((l) => [...l, card]);
    setPendingBottom((n) => n - 1);
  }

  function drawCard() {
    if (library.length === 0) return;
    setHand((h) => [...h, library[0]]);
    setLibrary((l) => l.slice(1));
    setTurn((t) => t + 1);
  }

  if (deckSize < HAND_SIZE) {
    return <p className="text-xs text-black/50 dark:text-white/50">Add at least {HAND_SIZE} cards to the mainboard to test-draw a hand.</p>;
  }

  const verdict = started && !bottoming ? keepVerdict(hand) : null;
  const lands = hand.filter(isLand).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-black/40 dark:text-white/40">
        Shuffles your {deckSize} mainboard cards (your commander waits in the command zone) and draws an opening hand. The first mulligan
        is free; after that you put one card on the bottom per mulligan.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => deal(0)}
          className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
        >
          {started ? "New hand" : "Draw opening hand"}
        </button>
        {started && (
          <>
            <button
              onClick={() => deal(mulligans + 1)}
              disabled={turn > 0}
              className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/25 dark:hover:bg-white/10"
            >
              Mulligan
            </button>
            <button
              onClick={drawCard}
              disabled={bottoming || library.length === 0}
              className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/25 dark:hover:bg-white/10"
            >
              Draw a card (turn {turn + 1})
            </button>
          </>
        )}
      </div>

      {commanders.length > 0 && (
        <div className="text-xs text-black/60 dark:text-white/60">
          Command zone: <span className="font-medium">{commanders.map((c) => c.card.name).join(" & ")}</span>
        </div>
      )}

      {started && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold">
              {turn === 0 ? "Opening hand" : `Turn ${turn + 1}`} · {hand.length} cards · {lands} land{lands === 1 ? "" : "s"}
            </span>
            {mulligans > 0 && <span className="text-black/50 dark:text-white/50">{mulligans === 1 ? "1 mulligan (free)" : `${mulligans} mulligans`}</span>}
            {verdict && (
              <span className={`rounded-full px-2 py-0.5 font-semibold ${verdict.good ? "bg-[#0ca30c]/15 text-[#0b7a0b] dark:text-[#3fd13f]" : "bg-[#fab219]/20 text-[#8a5a00] dark:text-[#fab219]"}`}>
                {verdict.label}
              </span>
            )}
          </div>
          {verdict && <p className="text-xs text-black/60 dark:text-white/60">{verdict.detail}</p>}
          {bottoming && (
            <p className="rounded-md bg-[#2a78d6]/10 px-3 py-2 text-xs font-medium text-[#2a78d6] dark:text-[#3987e5]">
              Click {pendingBottom} card{pendingBottom === 1 ? "" : "s"} to put on the bottom of your library.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {hand.map((card, i) => {
              const img = cardImageUrl(card, "small");
              return (
                <HoverPreview
                  key={`${card.id}-${i}`}
                  as="div"
                  placement="beside"
                  imageUri={cardImageUrl(card, "normal")}
                  alt={card.name}
                  price={formatPrice(card)}
                  className={`overflow-hidden rounded-lg border ${bottoming ? "cursor-pointer border-[#2a78d6] hover:opacity-70" : "border-black/10 dark:border-white/10"}`}
                >
                  <button disabled={!bottoming} onClick={() => bottomCard(i)} className="block w-full text-left disabled:cursor-default">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={card.name} className="aspect-[5/7] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[5/7] items-center justify-center p-1 text-center text-[10px]">{card.name}</div>
                    )}
                  </button>
                </HoverPreview>
              );
            })}
          </div>
          <p className="text-[11px] text-black/40 dark:text-white/40">Library: {library.length} cards left.</p>
        </>
      )}
    </div>
  );
}
