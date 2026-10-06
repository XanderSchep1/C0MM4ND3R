import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          C0MM4ND3R
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm sm:gap-4">
          <ThemeToggle />
          {session?.user ? (
            <>
              <Link href="/decks" className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white">
                My decks
              </Link>
              <Link href="/account" className="hidden text-black/40 hover:text-black sm:inline dark:text-white/40 dark:hover:text-white">
                {session.user.name ?? session.user.email}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/signin" className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
