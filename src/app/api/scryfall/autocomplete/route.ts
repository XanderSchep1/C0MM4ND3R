import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { autocomplete } from "@/lib/scryfall";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "autocomplete", { suggestions: [] });
  if (limited) return limited;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  // Card names change only when a set comes out, so the browser may keep an answer for a day. If Scryfall
  // can't answer, say "no suggestions" (never kept) rather than failing: they're a nicety, not the search.
  try {
    return NextResponse.json({ suggestions: await autocomplete(q) }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
