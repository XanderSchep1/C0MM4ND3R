import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getDeckAccessWithCards, personName } from "@/lib/deck-access";
import { resolveDeck } from "@/lib/deck-data";
import { getRecentSets } from "@/lib/sets";
import { DeckBuilder } from "@/components/deck-builder/deck-builder";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  // Your own deck, or one a friend invited you to. Anyone else gets a plain "not found".
  const { id } = await params;
  const access = await getDeckAccessWithCards(id, session.user.id);
  if (!access) notFound();
  const { deck, role } = access;

  // Highlights are the owner's private notes; everyone with access sees who suggested which card.
  const resolved = await resolveDeck(deck, { withMarks: role === "owner", withAuthors: true });

  const newSetCount =
    role === "owner"
      ? await getRecentSets()
          .then((sets) => sets.filter((s) => !deck.upgradesSeenSets.includes(s.code)).length)
          .catch(() => 0)
      : 0;

  return (
    <DeckBuilder
      deckId={id}
      initialDeck={resolved}
      newSetCount={newSetCount}
      role={role}
      viewer={{ id: session.user.id, name: personName({ name: session.user.name ?? null, email: session.user.email ?? null }) }}
      ownerName={personName(deck.user)}
    />
  );
}
