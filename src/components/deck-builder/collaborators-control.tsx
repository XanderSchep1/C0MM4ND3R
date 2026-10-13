"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";

interface FriendRow {
  id: string;
  name: string;
  invited: boolean;
}

// "Friends": choose which of your friends are invited to this deck. Invited friends can look at the deck and
// suggest cards (which wait in your Maybeboard); they can't change anything else.
export function CollaboratorsControl({ deckId }: { deckId: string }) {
  const { show } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invitedCount, setInvitedCount] = useState<number | null>(null);

  // A native <dialog> gives us the backdrop, focus trapping and Esc to close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setFriends(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/collaborators`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return setError(data?.error ?? "Couldn't load your friends. Try again.");
      setFriends(data.friends);
      setInvitedCount((data.friends as FriendRow[]).filter((f) => f.invited).length);
    } catch {
      setError("Couldn't load your friends. Try again.");
    }
  }

  async function toggle(friend: FriendRow) {
    if (!friends) return;
    const next = friends.map((f) => (f.id === friend.id ? { ...f, invited: !f.invited } : f));
    setFriends(next); // shows at once; put back if the save fails
    setSaving(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/collaborators`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: next.filter((f) => f.invited).map((f) => f.id) }),
      });
      if (!res.ok) throw new Error();
      setInvitedCount(next.filter((f) => f.invited).length);
      show({ message: friend.invited ? `${friend.name} can no longer see this deck.` : `${friend.name} can now see this deck and suggest cards.`, durationMs: 4000 });
    } catch {
      setFriends(friends);
      show({ message: "Couldn't save that. Try again.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        Friends{invitedCount ? ` (${invitedCount})` : ""}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        aria-label="Share this deck with friends"
        className="m-auto w-[min(440px,92vw)] rounded-xl border border-black/20 bg-white p-5 text-black shadow-2xl backdrop:bg-black/60 dark:border-white/25 dark:bg-neutral-900 dark:text-white"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Share this deck with friends</h2>
            <p className="mt-1 text-xs text-black/60 dark:text-white/60">
              An invited friend can look at the deck and suggest cards. Their suggestions wait in your Maybeboard with their name on them: you accept or dismiss
              each one. They can&apos;t change your Mainboard, commander or anything else.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10">
            Done
          </button>
        </div>

        {error && <p className="mt-4 text-xs text-[#d03b3b]">{error}</p>}
        {!error && friends === null && <p className="mt-4 text-xs text-black/50 dark:text-white/50">Loading…</p>}
        {friends && friends.length === 0 && (
          <p className="mt-4 text-sm text-black/60 dark:text-white/60">
            You don&apos;t have any friends here yet.{" "}
            <Link href="/friends" className="font-semibold underline underline-offset-2">
              Get your friend link
            </Link>
            , send it to someone, and they&apos;ll show up here once they accept.
          </p>
        )}
        {friends && friends.length > 0 && (
          <ul className="mt-4 flex flex-col divide-y divide-black/10 rounded-lg border border-black/15 dark:divide-white/10 dark:border-white/20">
            {friends.map((friend) => (
              <li key={friend.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-medium">{friend.name}</span>
                  <span className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
                    Can suggest cards
                    <input type="checkbox" checked={friend.invited} disabled={saving} onChange={() => toggle(friend)} className="h-4 w-4" />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
