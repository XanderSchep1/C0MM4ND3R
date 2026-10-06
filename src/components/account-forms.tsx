"use client";

import { useActionState, useState } from "react";
import { changePasswordAction, deleteAccountAction, regenerateRecoveryCodeAction, type AccountState } from "@/app/account/actions";
import { RecoveryCodeNotice } from "./recovery-code-notice";

const inputClass = "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black";
const buttonClass = "self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black";
const initial: AccountState = {};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Feedback({ state }: { state: AccountState }) {
  if (state.error) return <p className="text-xs text-[#d03b3b]">{state.error}</p>;
  if (state.message) return <p className="text-xs text-[#0b7a0b] dark:text-[#3fd13f]">{state.message}</p>;
  return null;
}

export function AccountForms({ email }: { email: string }) {
  const [pwState, pwAction, pwPending] = useActionState(changePasswordAction, initial);
  const [codeState, codeAction, codePending] = useActionState(regenerateRecoveryCodeAction, initial);
  const [delState, delAction, delPending] = useActionState(deleteAccountAction, initial);
  const [codeDismissed, setCodeDismissed] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <Section title="Change password">
        <form action={pwAction} className="flex flex-col gap-2">
          <input name="currentPassword" type="password" required autoComplete="current-password" placeholder="Current password" className={inputClass} />
          <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" placeholder="New password (at least 8 characters)" className={inputClass} />
          <Feedback state={pwState} />
          <button type="submit" disabled={pwPending} className={buttonClass}>
            {pwPending ? "Saving…" : "Change password"}
          </button>
        </form>
      </Section>

      <Section
        title="Recovery code"
        description="Your recovery code lets you reset a forgotten password. Generating a new one replaces the old one, which stops working."
      >
        {codeState.recoveryCode && !codeDismissed ? (
          <RecoveryCodeNotice code={codeState.recoveryCode} continueLabel="Done" onContinue={() => setCodeDismissed(true)} />
        ) : (
          <form action={codeAction} onSubmit={() => setCodeDismissed(false)} className="flex flex-col gap-2">
            <input name="currentPassword" type="password" required autoComplete="current-password" placeholder="Current password" className={inputClass} />
            <Feedback state={codeState} />
            <button type="submit" disabled={codePending} className={buttonClass}>
              {codePending ? "Generating…" : "Generate a new recovery code"}
            </button>
          </form>
        )}
      </Section>

      <Section title="Delete account" description="Permanently deletes your account, all your decks and your collection. This can't be undone.">
        <form
          action={delAction}
          onSubmit={(e) => {
            if (!confirm("Delete your account and all your decks forever?")) e.preventDefault();
          }}
          className="flex flex-col gap-2"
        >
          <input name="currentPassword" type="password" required autoComplete="current-password" placeholder="Current password" className={inputClass} />
          <input name="confirmEmail" type="email" required autoComplete="off" placeholder={`Type ${email} to confirm`} className={inputClass} />
          <Feedback state={delState} />
          <button type="submit" disabled={delPending} className="self-start rounded-md bg-[#d03b3b] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {delPending ? "Deleting…" : "Delete my account"}
          </button>
        </form>
      </Section>
    </div>
  );
}
