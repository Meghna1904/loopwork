import { TOKEN } from "./grammar.js";
import { COMPOUND_ALIASES } from "./stitch-registry.js";

// Character-level tokenizer. It keeps the source offset on every token so
// error messages can point at the part of the line that caused them.
//
// Two things need more than a plain word scan:
//   sc2tog, dc3tog   registry aliases containing digits
//   3rd, 2nd         ordinals, read as the number plus a swallowed suffix

const ORDINAL_SUFFIX = /^(?:st|nd|rd|th)\b/i;

export function tokenize(source) {
  const text = String(source ?? "");
  const tokens = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === "(") {
      tokens.push({ kind: TOKEN.LPAREN, value: character, index });
      index += 1;
      continue;
    }

    if (character === ")") {
      tokens.push({ kind: TOKEN.RPAREN, value: character, index });
      index += 1;
      continue;
    }

    if (character === "," || character === ";" || character === "·") {
      tokens.push({ kind: TOKEN.SEPARATOR, value: character, index });
      index += 1;
      continue;
    }

    if (character === ":") {
      tokens.push({ kind: TOKEN.COLON, value: character, index });
      index += 1;
      continue;
    }

    if (character === "*") {
      tokens.push({ kind: TOKEN.STAR, value: character, index });
      index += 1;
      continue;
    }

    const number = /^\d+(?:[.,]\d+)?/.exec(text.slice(index));
    if (number) {
      const rest = text.slice(index + number[0].length);
      const ordinal = ORDINAL_SUFFIX.exec(rest);
      const raw = ordinal ? number[0] + ordinal[0] : number[0];
      tokens.push({
        kind: TOKEN.NUMBER,
        value: Number(number[0].replace(",", ".")),
        raw,
        ordinal: Boolean(ordinal),
        index
      });
      index += raw.length;
      continue;
    }

    // "sc2tog" and friends: a known alias written as one word with a digit in it.
    const compound = matchCompound(text, index);
    if (compound) {
      tokens.push({ kind: TOKEN.WORD, value: compound, index });
      index += compound.length;
      continue;
    }

    const word = /^[A-Za-z][A-Za-z'’-]*/.exec(text.slice(index));
    if (word) {
      tokens.push({ kind: TOKEN.WORD, value: word[0], index });
      index += word[0].length;
      continue;
    }

    tokens.push({ kind: TOKEN.UNKNOWN, value: character, index });
    index += 1;
  }

  return tokens;
}

function matchCompound(text, index) {
  const rest = text.slice(index).toLowerCase();
  for (const alias of COMPOUND_ALIASES) {
    if (!rest.startsWith(alias)) continue;
    const after = rest[alias.length];
    if (after && /[a-z0-9]/.test(after)) continue;
    return text.slice(index, index + alias.length);
  }
  return null;
}

export function wordsOf(tokens) {
  return tokens.map((token) => (token.kind === TOKEN.WORD ? token.value.toLowerCase() : token.kind));
}
