import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { getFriendCode, listFriends, regenerateFriendCode } from "@/lib/friends";

// Your friends, and the code that makes your friend link.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "friends");
  if (limited) return limited;

  const [friends, friendCode] = await Promise.all([listFriends(session.user.id), getFriendCode(session.user.id)]);
  return NextResponse.json({ friends, friendCode });
}

// { action: "new-code" }: replace your friend link. The old link stops working.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "friends");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (body?.action !== "new-code") return NextResponse.json({ error: 'action must be "new-code"' }, { status: 400 });
  return NextResponse.json({ friendCode: await regenerateFriendCode(session.user.id) });
}
