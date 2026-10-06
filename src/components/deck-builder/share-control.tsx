"use client";

import { useState } from "react";

interface Props {
  deckId: string;
  isPublic: boolean;
  onToggle: (next: boolean) => void | Promise<void>;
}

export function ShareControl({ deckId, isPublic, onToggle }: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/${deckId}` : `/share/${deckId}`;

  async function toggle() {
    setBusy(true);
    try {
      await onToggle(!isPublic);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {isPublic && (
        <button
          onClick={copyLink}
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          {copied ? "Copied!" : "Copy share link"}
        </button>
      )}
      <button
        onClick={toggle}
        disabled={busy}
        className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
          isPublic
            ? "border-[#0ca30c]/40 bg-[#0ca30c]/10 text-[#0ca30c]"
            : "border-black/15 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
        }`}
      >
        {busy ? "Saving…" : isPublic ? "Shared — click to unshare" : "Share"}
      </button>
    </div>
  );
}
