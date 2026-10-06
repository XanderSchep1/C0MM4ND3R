import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewDeckForm } from "@/components/new-deck-form";

export default async function DecksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const decks = await prisma.deck.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });

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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
