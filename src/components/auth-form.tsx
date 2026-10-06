"use client";

import { useActionState, useState } from "react";
import { registerAction, signInAction, type FormState } from "@/app/signin/actions";

const inputClass = "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black";
const initial: FormState = {};

export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, initial);
  const [registerState, registerFormAction, registerPending] = useActionState(registerAction, initial);

  const registering = mode === "register";
  const state = registering ? registerState : signInState;
  const pending = registering ? registerPending : signInPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-black/10 dark:border-white/10">
        {(
          [
            ["signin", "Sign in"],
            ["register", "Create account"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`px-3 py-1.5 text-sm font-medium ${mode === value ? "border-b-2 border-black text-black dark:border-white dark:text-white" : "text-black/40 dark:text-white/40"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <form key={mode} action={registering ? registerFormAction : signInFormAction} className="flex flex-col gap-2">
        {registering && <input name="name" type="text" autoComplete="name" placeholder="Display name (optional)" className={inputClass} />}
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={inputClass} />
        <input
          name="password"
          type="password"
          required
          minLength={registering ? 8 : undefined}
          autoComplete={registering ? "new-password" : "current-password"}
          placeholder={registering ? "Password (at least 8 characters)" : "Password"}
          className={inputClass}
        />
        {state.error && <p className="text-xs text-[#d03b3b]">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/85"
        >
          {pending ? "Please wait…" : registering ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
