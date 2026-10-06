"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { resetPasswordAction, type ResetState } from "@/app/reset-password/actions";
import { RecoveryCodeNotice } from "./recovery-code-notice";

const inputClass = "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black";
const initial: ResetState = {};

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);

  if (state.newRecoveryCode) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-md bg-[#0ca30c]/15 px-3 py-2 text-sm text-[#0b7a0b] dark:text-[#3fd13f]">Password changed. You can sign in with it now.</p>
        <RecoveryCodeNotice code={state.newRecoveryCode} continueLabel="Go to sign in" onContinue={() => router.push("/signin")} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={inputClass} />
      <input name="code" type="text" required autoComplete="off" placeholder="Recovery code (XXXX-XXXX-XXXX-XXXX)" className={`${inputClass} font-mono`} />
      <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="New password (at least 8 characters)" className={inputClass} />
      {state.error && <p className="text-xs text-[#d03b3b]">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/85"
      >
        {pending ? "Please wait…" : "Reset password"}
      </button>
      <Link href="/signin" className="self-center text-xs text-black/50 underline hover:text-black dark:text-white/50 dark:hover:text-white">
        Back to sign in
      </Link>
    </form>
  );
}
