import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { resolveDeck } from "@/lib/deck-data";
import { validateCommanderDeck } from "@/lib/commander";
import { analyzeDeck, calculatePriceTotal, estimatePowerLevel } from "@/lib/deck-analysis";
import { colorIdentityUnion, cardImageUrl, mostExpensive } from "@/lib/card-helpers";
import { StatsPanel } from "@/components/deck-builder/stats-panel";
import { ReadOnlyDecklist } from "@/components/deck-builder/read-only-decklist";

async function loadPublicDeck(id: string) {
  const deck = await prisma.deck.findFirst({ where: { id, public: true }, include: { cards: true } });
  if (!deck) return null;
  return resolveDeck(deck);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const deck = await loadPublicDeck(id);
  if (!deck) return { title: "Deck not found — C0MM4ND3R" };
  return {
    title: `${deck.name} — C0MM4ND3R`,
    description: deck.description ?? `A Commander deck${deck.commanders[0] ? ` led by ${deck.commanders[0].card.name}` : ""}.`,
  };
}

export default async function SharedDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await loadPublicDeck(id);
  if (!deck) notFound();

  const validation = validateCommanderDeck(deck.commanders, deck.mainboard);
  const colorIdentity = colorIdentityUnion(deck.commanders.map((c) => c.card));
  const analysis = analyzeDeck(deck.mainboard, colorIdentity);
  const ownedCards = [...deck.commanders, ...deck.mainboard];
  const powerLevel = estimatePowerLevel(ownedCards);
  const priceTotal = calculatePriceTotal(ownedCards);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-black/50 dark:text-white/50">
        <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">Read-only shared deck</span>
      </div>
      <h1 className="mb-1 text-2xl font-semibold">{deck.name}</h1>
      {deck.description && <p className="mb-6 text-sm text-black/50 dark:text-white/50">{deck.description}</p>}
      {!deck.description && <div className="mb-6" />}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Commander</h2>
            <div className="flex gap-3">
              {deck.commanders.map(({ card }) => {
                const img = cardImageUrl(card, "normal");
                return (
                  <div key={card.id} className="w-32 shrink-0 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img && <img src={img} alt={card.name} className="w-full" />}
                  </div>
                );
              })}
            </div>
          </section>

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
