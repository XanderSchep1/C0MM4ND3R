import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { removeFriend } from "@/lib/friends";

// Stop being friends. Each of you is also taken off the other's decks.
export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "friends");
  if (limited) return limited;

  const { userId } = await params;
  if (!userId || userId === session.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await removeFriend(session.user.id, userId);
  return NextResponse.json({ ok: true });
}
