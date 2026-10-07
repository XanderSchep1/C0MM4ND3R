"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

interface Friend {
  id: string;
  name: string;
}

export function FriendsManager({ initialFriends, initialCode, origin }: { initialFriends: Friend[]; initialCode: string; origin: string }) {
  const router = useRouter();
  const { show } = useToast();
  const [friends, setFriends] = useState(initialFriends);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const link = `${origin}/friends/join/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      show({ message: "Friend link copied. Send it to someone you want as a friend.", durationMs: 4000 });
    } catch {
      show({ message: "Couldn't copy automatically. Select the link and copy it.", tone: "error" });
    }
  }

  async function newLink() {
    if (!confirm("Make a new friend link? The old one will stop working (friends you already have are not affected).")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "new-code" }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return show({ message: data?.error ?? "Couldn't make a new link. Try again.", tone: "error" });
      setCode(data.friendCode);
      show({ message: "New friend link ready. The old one no longer works.", durationMs: 4000 });
    } finally {
      setBusy(false);
    }
  }

  async function remove(friend: Friend) {
    if (!confirm(`Remove ${friend.name} from your friends? They'll also lose access to any of your decks you shared with them.`)) return;
    const res = await fetch(`/api/friends/${friend.id}`, { method: "DELETE" });
    if (!res.ok) return show({ message: "Couldn't remove them. Try again.", tone: "error" });
    setFriends((all) => all.filter((f) => f.id !== friend.id));
    router.refresh();
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section aria-labelledby="link-heading" className="rounded-lg border border-black/15 p-4 dark:border-white/20">
        <h2 id="link-heading" className="text-sm font-semibold">
          Your friend link
        </h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Anyone who opens this link while signed in can choose to become your friend. Only share it with people you know.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Your friend link"
            className="min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 font-mono text-xs dark:border-white/15"
          />
          <button type="button" onClick={copy} className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-black">
            Copy link
          </button>
          <button
            type="button"
            onClick={newLink}
            disabled={busy}
            className="rounded-md border border-black/25 px-3 py-2 text-xs font-semibold hover:bg-black/5 disabled:opacity-40 dark:border-white/30 dark:hover:bg-white/10"
          >
            Make a new link
          </button>
        </div>
      </section>

      <section aria-labelledby="friends-heading">
        <h2 id="friends-heading" className="text-sm font-semibold">
          Your friends ({friends.length})
        </h2>
        {friends.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">No friends yet. Send them your link above, or open theirs.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-black/10 rounded-lg border border-black/15 dark:divide-white/10 dark:border-white/20">
            {friends.map((friend) => (
              <li key={friend.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-medium">{friend.name}</span>
                <button
                  type="button"
                  onClick={() => remove(friend)}
                  className="rounded-md border border-black/20 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-black/40 dark:text-white/40">
          To share a deck, open it and use <strong>Friends</strong> at the top. Friends can&apos;t see your other decks.
        </p>
      </section>
    </div>
  );
}
