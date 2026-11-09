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

// The Type search: every word typed is a creature type the card must have ("elf warrior" finds Elf Warriors),
// and `changelings` also lets through Changelings, which count as every type. `t:` matches part of a type, so
// "gobl" finds Goblins. Each clause stands alone (an `or` is always inside its own brackets) because the search
// route puts more filters after it. Anything with an operator in it (`t:elf`) is left alone, as in the keyword search.
const OPERATOR_RE = /[a-z!@-]+[:=]|[<>]=?/i;

export function buildTypeClause(raw: string, opts: { changelings?: boolean } = {}): string {
  const trimmed = raw.trim();
  if (!trimmed || OPERATOR_RE.test(trimmed)) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .map((word) => (opts.changelings ? `(t:"${word}" or keyword:changeling)` : `t:"${word}"`))
    .join(" ");
}
