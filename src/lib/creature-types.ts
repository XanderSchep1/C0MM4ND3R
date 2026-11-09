// Quick picks for the Type search: the creature types that match what is being typed, and what typing one in does.

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

// Types matching the word being typed (the last one), those that start with it first. A type that is exactly
// what was typed isn't offered back.
export function suggestTypes(types: string[], typed: string, limit = 8): string[] {
  const word = (words(typed).pop() ?? "").toLowerCase();
  if (word.length < 2) return [];
  const phrase = words(typed).join(" ").toLowerCase();
  const starting: string[] = [];
  const containing: string[] = [];
  for (const type of types) {
    const lower = type.toLowerCase();
    if (lower === word || lower === phrase) continue;
    if (lower.startsWith(word)) starting.push(type);
    else if (lower.includes(word)) containing.push(type);
  }
  return [...starting, ...containing].slice(0, limit);
}

// The text with the word being typed replaced by the type. A type of several words ("Time Lord") also replaces
// the earlier words it covers, so typing "time lord" and picking it doesn't give "time Time Lord".
export function pickType(typed: string, type: string): string {
  const typedWords = words(typed);
  const lowerType = type.toLowerCase();
  let replaced = Math.min(1, typedWords.length);
  for (let n = Math.min(words(type).length, typedWords.length); n >= 2; n--) {
    if (lowerType.includes(typedWords.slice(-n).join(" ").toLowerCase())) {
      replaced = n;
      break;
    }
  }
  return [...typedWords.slice(0, typedWords.length - replaced), type].join(" ");
}
