import Link from "next/link";
import { validateCommanderDeck } from "@/lib/commander";
import { analyzeDeck, calculatePriceTotal, estimatePowerLevel } from "@/lib/deck-analysis";
import { colorIdentityUnion, cardImageUrl, mostExpensive } from "@/lib/card-helpers";
import { StatsPanel } from "@/components/deck-builder/stats-panel";
import { ReadOnlyDecklist } from "@/components/deck-builder/read-only-decklist";
import type { DeckCardEntry, ResolvedDeck } from "@/components/deck-builder/types";

const buttonClass = "rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10";
const primaryButtonClass = "rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85";

// What anyone with a deck's link sees: the whole decklist to look through, nothing to change. Someone without an
// account is invited to make one. The owner is not named, and the owner's private notes are never loaded.
export function SharedDeckView({ deck, signedIn }: { deck: ResolvedDeck; signedIn: boolean }) {
  const validation = validateCommanderDeck(deck.commanders, deck.mainboard, deck.companions);
  const colorIdentity = colorIdentityUnion(deck.commanders.map((c) => c.card));
  const analysis = analyzeDeck(deck.mainboard, colorIdentity);
  const ownedCards = [...deck.commanders, ...deck.mainboard];
  const powerLevel = estimatePowerLevel(ownedCards);
  const priceTotal = calculatePriceTotal([...ownedCards, ...deck.companions]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div
        role="note"
        className="mb-6 flex flex-col gap-3 rounded-md border border-[#2a78d6]/30 bg-[#2a78d6]/10 px-4 py-3 text-sm text-[#1c5aa8] sm:flex-row sm:items-center sm:justify-between dark:text-[#7db3f0]"
      >
        <p>
          <strong>Shared deck, read-only.</strong>{" "}
          {signedIn ? "You can look through it but not change it." : "Make a free account to build and tune your own Commander decks."}
        </p>
        <div className="flex shrink-0 gap-2">
          {signedIn ? (
            <Link href="/decks" className={buttonClass}>
              My decks
            </Link>
          ) : (
            <>
              <Link href="/signin?mode=register" className={primaryButtonClass}>
                Create account
              </Link>
              <Link href="/signin" className={buttonClass}>
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>

      <h1 className="mb-1 text-2xl font-semibold">{deck.name}</h1>
      {deck.description && <p className="mb-6 text-sm text-black/50 dark:text-white/50">{deck.description}</p>}
      {!deck.description && <div className="mb-6" />}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Commander</h2>
            <CardRow entries={deck.commanders} />
          </section>

          {deck.companions.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Companion</h2>
              <CardRow entries={deck.companions} />
            </section>
          )}

          <section>
            <StatsPanel colorIdentity={validation.colorIdentity} analysis={analysis} powerLevel={powerLevel} priceTotal={priceTotal} expensive={mostExpensive([...deck.commanders, ...deck.mainboard])} />
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Mainboard ({deck.mainboard.reduce((sum, e) => sum + e.quantity, 0)})</h2>
            <ReadOnlyDecklist entries={deck.mainboard} />
          </section>

          {deck.maybeboard.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Maybeboard ({deck.maybeboard.reduce((sum, e) => sum + e.quantity, 0)})</h2>
              <ReadOnlyDecklist entries={deck.maybeboard} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function CardRow({ entries }: { entries: DeckCardEntry[] }) {
  return (
    <div className="flex gap-3">
      {entries.map(({ card }) => {
        const img = cardImageUrl(card, "normal");
        return (
          <div key={card.id} className="w-32 shrink-0 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {img && <img src={img} alt={card.name} className="w-full" />}
          </div>
        );
      })}
    </div>
  );
}
