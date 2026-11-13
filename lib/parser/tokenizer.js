import { TOKEN } from "./grammar.js";

// Character-level tokenizer. It keeps the source offset on every token so
// error messages can point at the part of the line that caused them.

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
      tokens.push({ kind: TOKEN.NUMBER, value: Number(number[0].replace(",", ".")), raw: number[0], index });
      index += number[0].length;
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

export function wordsOf(tokens) {
  return tokens.map((token) => (token.kind === TOKEN.WORD ? token.value.toLowerCase() : token.kind));
}
