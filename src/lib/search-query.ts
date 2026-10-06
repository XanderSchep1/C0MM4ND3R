// Scryfall's bare-word search only matches card *names* — searching "flying"
// finds ~11 cards with "Flying" in the name, not the ~4,400 cards that
// actually have the flying keyword in their rules text. The keyword search
// tab always wants the latter, so it wraps plain terms in an oracle-text
// phrase search instead. Advanced Scryfall syntax (already containing an
// operator) is left alone so power users can still type things like
// `t:instant o:draw` directly.
const ADVANCED_SYNTAX_RE = /[a-z!@-]+[:=]|[<>]=?|"/i;

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '\\"');
}

export function buildKeywordClause(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || ADVANCED_SYNTAX_RE.test(trimmed)) return trimmed;
  return `o:"${escapeQuotes(trimmed)}"`;
}
