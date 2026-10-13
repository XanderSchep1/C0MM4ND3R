import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { acceptInvite } from "@/lib/friends";

// Accept someone's friend link: { code }. Limited per person, since the code is the only secret.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "friendJoin");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const outcome = await acceptInvite(session.user.id, code);
  switch (outcome.status) {
    case "invalid":
      return NextResponse.json({ error: "That friend link isn't valid any more." }, { status: 404 });
    case "self":
      return NextResponse.json({ error: "That's your own friend link." }, { status: 400 });
    case "already":
      return NextResponse.json({ status: "already", friend: outcome.friend });
    case "ok":
      return NextResponse.json({ status: "ok", friend: outcome.friend }, { status: 201 });
  }
}
