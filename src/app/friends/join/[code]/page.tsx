import Link from "next/link";
import { auth } from "@/auth";
import { JoinFriend } from "@/components/join-friend";
import { lookupInvite } from "@/lib/friends";

const card = "mx-auto mt-16 max-w-md rounded-lg border border-black/15 p-6 dark:border-white/20";

// Opening someone's friend link. Nothing happens until you press the button: a link alone never adds anyone.
export default async function JoinFriendPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <div className={card}>
        <h1 className="text-lg font-semibold">You&apos;ve been invited to be friends</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">Sign in (or create an account) first, then open the link again.</p>
        <Link href="/signin" className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">
          Sign in
        </Link>
      </div>
    );
  }

  const outcome = await lookupInvite(session.user.id, code.toUpperCase());

  if (outcome.status === "pending") return <JoinFriend code={code.toUpperCase()} friendName={outcome.friend.name} />;

  const message =
    outcome.status === "already"
      ? `You and ${outcome.friend.name} are already friends.`
      : outcome.status === "self"
        ? "That's your own friend link. Send it to someone else."
        : "This friend link isn't valid any more. Ask your friend for a new one.";
  return (
    <div className={card}>
      <h1 className="text-lg font-semibold">Friend link</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">{message}</p>
      <Link href="/friends" className="mt-4 inline-block rounded-md border border-black/25 px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:border-white/30 dark:hover:bg-white/10">
        Go to Friends
      </Link>
    </div>
  );
}
