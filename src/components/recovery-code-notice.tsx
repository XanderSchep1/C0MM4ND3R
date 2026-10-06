"use client";

import { useState } from "react";

// Shown once after sign-up, a password reset, or generating a new code. The
// code is only stored as a hash, so this is the only chance to save it.
export function RecoveryCodeNotice({
  code,
  continueLabel,
  onContinue,
}: {
  code: string;
  continueLabel: string;
  onContinue: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is on screen to copy by hand.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#fab219]/50 bg-[#fab219]/10 p-4">
      <div className="text-sm font-semibold">Save your recovery code</div>
      <p className="text-xs text-black/70 dark:text-white/70">
        If you ever forget your password, this code is the only way to get back in. It&apos;s shown once and can&apos;t be looked up
        later. Write it down or store it in a password manager.
      </p>
      <div className="select-all rounded-md bg-black px-3 py-2 text-center font-mono text-lg font-bold tracking-widest text-white dark:bg-white dark:text-black">
        {code}
      </div>
      <button
        type="button"
        onClick={copy}
        className="self-start rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
      >
        {copied ? "Copied!" : "Copy code"}
      </button>
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have saved my recovery code
      </label>
      <button
        type="button"
        disabled={!saved}
        onClick={onContinue}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {continueLabel}
      </button>
    </div>
  );
}
