import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewDeckForm } from "@/components/new-deck-form";
import { getRecentSets } from "@/lib/sets";
import { personName } from "@/lib/deck-access";

export default async function DecksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const decks = await prisma.deck.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });

  // Decks friends have invited you to (you can see them and suggest cards).
  const shared = await prisma.deck.findMany({
    where: { collaborators: { some: { userId: session.user.id } } },
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { name: true, email: true } }, _count: { select: { cards: true } } },
  });

  const recentSets = await getRecentSets().catch(() => []);
  const newSetCount = (deck: { upgradesSeenSets: string[] }) => recentSets.filter((s) => !deck.upgradesSeenSets.includes(s.code)).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My decks</h1>
      </div>

      <NewDeckForm />

      {decks.length === 0 ? (
        <p className="mt-10 text-sm text-black/50 dark:text-white/50">No decks yet — create one above to get started.</p>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {decks.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/decks/${deck.id}`}
                className="block rounded-lg border border-black/10 p-4 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
              >
                <div className="font-medium">{deck.name}</div>
                <div className="mt-1 text-xs text-black/50 dark:text-white/50">{deck._count.cards} cards · Commander</div>
                {newSetCount(deck) > 0 && (
                  <div className="mt-2 inline-block rounded bg-[#2a78d6]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#2a78d6] dark:bg-[#3987e5]/15 dark:text-[#3987e5]">
                    {newSetCount(deck)} new set{newSetCount(deck) === 1 ? "" : "s"} — check for upgrades
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {shared.length > 0 && (
        <section aria-labelledby="shared-heading" className="mt-12">
          <h2 id="shared-heading" className="text-lg font-semibold">
            Shared with me
          </h2>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">Friends invited you to these decks. You can look around and suggest cards; the owner decides what goes in.</p>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shared.map((deck) => (
              <li key={deck.id}>
                <Link
                  href={`/decks/${deck.id}`}
                  className="block rounded-lg border border-black/10 p-4 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                >
                  <div className="font-medium">{deck.name}</div>
                  <div className="mt-1 text-xs text-black/50 dark:text-white/50">
                    {deck._count.cards} cards · by {personName(deck.user)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
