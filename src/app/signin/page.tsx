import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Build and tune your Commander decks.</p>
      </div>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/decks" });
        }}
      >
        <button type="submit" className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85">
          Continue with Google
        </button>
      </form>

      {process.env.NODE_ENV !== "production" && (
        <div className="border-t border-black/10 pt-6 dark:border-white/10">
          <p className="mb-2 text-xs font-medium text-black/50 dark:text-white/50">Dev-only shortcut (not shown in production)</p>
          <form
            action={async (formData: FormData) => {
              "use server";
              await signIn("dev-login", {
                email: formData.get("email"),
                name: formData.get("name"),
                redirectTo: "/decks",
              });
            }}
            className="flex flex-col gap-2"
          >
            <input name="email" type="email" required placeholder="you@example.com" className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black" />
            <input name="name" type="text" placeholder="Display name (optional)" className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black" />
            <button type="submit" className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
              Continue as this email
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
