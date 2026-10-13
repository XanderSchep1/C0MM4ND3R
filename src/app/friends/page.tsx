import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FriendsManager } from "@/components/friends-manager";
import { getFriendCode, listFriends } from "@/lib/friends";

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const [friends, friendCode] = await Promise.all([listFriends(session.user.id), getFriendCode(session.user.id)]);

  // The address people will open, built from the request so it's right on localhost, previews and production alike.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Friends</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Friends can be invited to your decks to suggest cards. Their suggestions wait in your Maybeboard until you accept them, so your deck stays yours.
      </p>
      <FriendsManager initialFriends={friends} initialCode={friendCode} origin={origin} />
    </div>
  );
}
