import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { getCreatureTypes } from "@/lib/scryfall";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "autocomplete", { types: [] });
  if (limited) return limited;

  // The list changes only when a set brings a new type, so the browser may keep it for a day. If Scryfall can't
  // answer, say "no types" (never kept) rather than failing: the quick picks are a nicety, not the search.
  try {
    return NextResponse.json({ types: await getCreatureTypes() }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ types: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
