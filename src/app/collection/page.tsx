import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CollectionManager } from "@/components/collection-manager";

export default async function CollectionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">My collection</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        The cards you own. Your decks use this to mark what you still <span className="font-medium">need</span> to buy and what it costs.
      </p>
      <div className="mt-6">
        <CollectionManager />
      </div>
    </div>
  );
}
