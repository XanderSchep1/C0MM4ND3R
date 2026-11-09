import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getDeckAccessWithCards, personName } from "@/lib/deck-access";
import { resolveDeck } from "@/lib/deck-data";
import { deckDescription, loadPublicDeck, loadPublicDeckSummary } from "@/lib/public-deck";
import { getRecentSets } from "@/lib/sets";
import { DeckBuilder } from "@/components/deck-builder/deck-builder";
import { SharedDeckView } from "@/components/shared-deck-view";

// What a pasted link shows in a chat or a browser tab. A deck that isn't open to anyone with the link keeps the site's title.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const summary = await loadPublicDeckSummary((await params).id);
  if (!summary) return {};
  return { title: `${summary.name} — C0MM4ND3R`, description: deckDescription(summary) };
}

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  const { id } = await params;

  // Your own deck, or one a friend invited you to, opens in the builder.
  const access = userId ? await getDeckAccessWithCards(id, userId) : null;
  if (!access || !userId) {
    // Anyone else (signed in or not) can look through a deck its owner has opened to anyone with the link.
    const shared = await loadPublicDeck(id);
    if (shared) return <SharedDeckView deck={shared} signedIn={Boolean(userId)} />;
    // Otherwise it's private: sign in to find out whether it's yours, and a plain "not found" if it isn't.
    if (!userId) redirect("/signin");
    notFound();
  }
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
      viewer={{ id: userId, name: personName({ name: session?.user?.name ?? null, email: session?.user?.email ?? null }) }}
      ownerName={personName(deck.user)}
    />
  );
}
