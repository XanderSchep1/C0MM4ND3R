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

  const suggestions = await autocomplete(q);
  return NextResponse.json({ suggestions });
}
