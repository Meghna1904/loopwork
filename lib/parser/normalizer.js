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

  // "repeat 6 times" / "repeated 3 times" keep the word repeat: the parser
  // uses it to repeat everything written so far, while "x 6" repeats only the
  // instruction it sits next to. The trailing "times" is dropped here.
  const repeatWords = text.replace(/\b(?:repeat(?:ed)?|rep)\s+(\d+)\s*(?:more\s+)?times?\b/gi, (match, count) => {
    changed = true;
    return `repeat ${count}`;
  });
  text = repeatWords;

  const bareRep = text.replace(/\b(?:rep|repeat(?:ed)?)\s+(\d+)\b/gi, (match, count) => {
    changed = true;
    return `repeat ${count}`;
  });
  text = bareRep;

  // "6 times" after a group or an instruction means "x 6"; the word "times"
  // is swallowed here so it can never be read as an instruction of its own.
  const timesWords = text.replace(/(\d+)\s+times?\b/gi, (match, count) => {
    changed = true;
    return `x ${count}`;
  });
  text = timesWords;

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

// A pair like "(1 SC, INC]" is a typo the engine must not quietly fix.
// Nesting is fine — only a mismatched or stray bracket is mixed.
export function hasMixedBrackets(text) {
  const stack = [];
  for (const character of String(text)) {
    if (character === "(" || character === "[") {
      stack.push(character);
      continue;
    }
    if (character === ")" || character === "]") {
      const open = stack.pop();
      if (!open) return true;
      const matches = (open === "(" && character === ")") || (open === "[" && character === "]");
      if (!matches) return true;
    }
  }
  // Unclosed brackets are reported by the parser, not here.
  return false;
}

// Brackets and braces are treated as repetition parentheses, as the design
// notes require ("[ ] and { } become plain ( ) before anything is read").
export function normalizeBrackets(text) {
  return text.replace(/[[{]/g, "(").replace(/[\]}]/g, ")");
}

export function cleanLine(source) {
  const normalized = normalizeLine(source);
  if (hasMixedBrackets(normalized.text)) {
    // Leave the brackets as written so the parser can point at them.
    return { text: normalized.text, changed: normalized.changed, mixedBrackets: true };
  }
  return { text: normalizeBrackets(normalized.text), changed: normalized.changed, mixedBrackets: false };
}
