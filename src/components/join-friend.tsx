"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinFriend({ code, friendName }: { code: string; friendName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/friends/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(data?.error ?? "Couldn't add them. Try again.");
      router.push("/friends");
      router.refresh();
    } catch {
      setError("Couldn't add them. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-black/15 p-6 dark:border-white/20">
      <h1 className="text-lg font-semibold">{friendName} invited you to be friends</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Friends can invite each other to decks. Being friends doesn&apos;t show anyone your decks: each deck is shared one at a time, by its owner.
      </p>
      {error && <p className="mt-3 text-sm text-[#d03b3b]">{error}</p>}
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {busy ? "Adding…" : `Become friends with ${friendName}`}
      </button>
    </div>
  );
}
