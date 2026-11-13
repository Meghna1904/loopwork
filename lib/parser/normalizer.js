// Normalise the many ways people write the same instruction into one form
// the tokenizer can rely on. Anything that cannot be normalised is left as
// written so the parser can flag it instead of silently changing meaning.

const TYPOGRAPHIC_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
const CURLY_QUOTES = /[\u2018\u2019\u201a\u201b\u201c\u201d\u201e]/g;
const TIMES_SIGNS = /[\u00d7\u2715\u2716\u2717\u22c5]/g;
const DASHES = /[\u2012\u2013\u2014\u2015\u2212]/g;

export function normalizeLine(source) {
  let text = String(source ?? "");
  let changed = false;

  const replace = (pattern, value) => {
    const next = text.replace(pattern, typeof value === "function" ? value : () => value);
    if (next !== text) changed = true;
    text = next;
  };

  replace(TYPOGRAPHIC_SPACES, " ");
  replace(CURLY_QUOTES, (match) => (match === "\u2018" || match === "\u2019" || match === "\u201a" || match === "\u201b" ? "'" : '"'));
  replace(TIMES_SIGNS, "x");
  replace(DASHES, "-");
  replace(/[\u2018\u2019]/g, "'");

  // Star groups: *1 SC, INC* x 6 → (1 SC, INC) x 6
  const starGroups = text.replace(/\*([^*]+?)\*\s*(?:x\s*)?(\d+)?/gi, (match, body, count) => {
    changed = true;
    return count ? `(${body.trim()}) x ${count}` : `(${body.trim()})`;
  });
  text = starGroups;

  // "repeat 6 times" / "repeated 3 times" following a group or instruction.
  const repeatWords = text.replace(/\b(?:repeat(?:ed)?|rep)\s+(\d+)\s*(?:more\s+)?times?\b/gi, (match, count) => {
    changed = true;
    return `x ${count}`;
  });
  text = repeatWords;

  // "then" and "and" join instructions; treat them as separators.
  const joiningWords = text.replace(/\b(?:then|and)\b/gi, ",");
  if (joiningWords !== text) {
    changed = true;
    text = joiningWords;
  }

  // Correct a stray "×6"/"x6" with no space, but only between a group/number.
  const tightRepeat = text.replace(/\)\s*x\s*(?=\d)/gi, ") x ");
  if (tightRepeat !== text) {
    changed = true;
    text = tightRepeat;
  }

  text = text.replace(/\s+/g, " ").trim();
  return { text, changed };
}

// Brackets and braces are treated as repetition parentheses, as the design
// notes require ("[ ] and { } become plain ( ) before anything is read").
export function normalizeBrackets(text) {
  return text.replace(/[[{]/g, "(").replace(/[\]}]/g, ")");
}

export function cleanLine(source) {
  const normalized = normalizeLine(source);
  return { text: normalizeBrackets(normalized.text), changed: normalized.changed };
}
