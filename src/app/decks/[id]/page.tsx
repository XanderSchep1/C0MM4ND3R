import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { getRecentSets } from "@/lib/sets";
import { DeckBuilder } from "@/components/deck-builder/deck-builder";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) notFound();

  const resolved = await resolveDeck(deck, { withMarks: true });

  const newSetCount = await getRecentSets()
    .then((sets) => sets.filter((s) => !deck.upgradesSeenSets.includes(s.code)).length)
    .catch(() => 0);

  return (
    <DeckBuilder deckId={id} initialDeck={resolved} newSetCount={newSetCount} />
  );
}
