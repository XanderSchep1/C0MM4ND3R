import { redirect } from "next/navigation";

// A deck now opens at its own address (/decks/<id>) for everyone it is shared with. Links that were
// copied from here before keep working.
export default async function SharedDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/decks/${encodeURIComponent(id)}`);
}
