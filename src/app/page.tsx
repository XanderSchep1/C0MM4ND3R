import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/decks");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Build sharper Commander decks</h1>
      <p className="text-black/60 dark:text-white/60">
        Search live Scryfall data, import a decklist in seconds, and get suggestions that fill the actual gaps in your
        deck — ramp, removal, draw, and more, sorted by real-world Commander popularity.
      </p>
      <div>
        <Link href="/signin" className="inline-block rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85">
          Get started
        </Link>
      </div>
    </div>
  );
}
