import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { validateCommanderDeck } from "@/lib/commander";
import { analyzeDeck, calculatePriceTotal, estimatePowerLevel } from "@/lib/deck-analysis";
import { analyzeAnnoyance } from "@/lib/annoyance";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { getRecentSets } from "@/lib/sets";
import { DeckBuilder } from "@/components/deck-builder/deck-builder";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) notFound();

  const resolved = await resolveDeck(deck);
  const validation = validateCommanderDeck(resolved.commanders, resolved.mainboard);
  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  const analysis = analyzeDeck(resolved.mainboard, colorIdentity);
  const ownedCards = [...resolved.commanders, ...resolved.mainboard];
  const powerLevel = estimatePowerLevel(ownedCards);
  const priceTotal = calculatePriceTotal(ownedCards);
  const annoyance = analyzeAnnoyance(resolved.mainboard);

  const newSetCount = await getRecentSets()
    .then((sets) => sets.filter((s) => !deck.upgradesSeenSets.includes(s.code)).length)
    .catch(() => 0);

  return (
    <DeckBuilder
      deckId={id}
      initialDeck={resolved}
      initialValidation={validation}
      initialAnalysis={analysis}
      initialPowerLevel={powerLevel}
      initialPriceTotal={priceTotal}
      initialAnnoyance={annoyance}
      newSetCount={newSetCount}
    />
  );
}
