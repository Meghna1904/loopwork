import { TOKEN, SEVERITY, isRepeatOperator } from "./grammar.js";
import { cleanLine } from "./normalizer.js";
import { tokenize } from "./tokenizer.js";
import { PLACEMENT_WORDS, matchStitch, suggestStitch } from "./stitch-registry.js";

const SKIP = Symbol("skip");

// Upper bound on how many times one instruction may repeat. A mistyped count
// ("× 600") must not build a round of thousands of stitches in the browser.
const MAX_COUNT = 1000;

// Pull a declared output total off the end of a line. Three notations are
// accepted: "(48)", "= 48" and a bare trailing "48" (flagged as a note by the
// validator because it is a guess).
export function parseDeclaration(source) {
  const text = String(source ?? "");
  const bracket = text.match(/\(\s*(\d+)\s*(?:sts?|stitches?)?\s*\)\s*$/i);
  if (bracket) {
    return { declaredTotal: Number(bracket[1]), declaredStyle: "bracket", text: text.slice(0, bracket.index).trim() };
  }
  const equals = text.match(/(?:=|total(?:\s+of)?|there\s+are)\s*(\d+)\s*(?:sts?|stitches?)?\s*$/i);
  if (equals) {
    return { declaredTotal: Number(equals[1]), declaredStyle: "equals", text: text.slice(0, equals.index).trim() };
  }
  return { declaredTotal: null, declaredStyle: null, text };
}

// Parse one instruction into an ordered AST. Never throws: problems become
// issues so the line can still be shown with whatever could be read.
export function parseLine(source) {
  const { text: cleaned } = cleanLine(source);
  const declaration = parseDeclaration(cleaned);
  const tokens = tokenize(declaration.text);
  const state = { tokens, position: 0, issues: [] };

  const items = parseSequence(state, false);
  let { declaredTotal, declaredStyle } = declaration;

  const leftovers = state.tokens.slice(state.position);
  if (leftovers.length) {
    const bare = readBareTotal(leftovers);
    if (bare && declaredTotal == null) {
      declaredTotal = bare.value;
      declaredStyle = "bare";
    } else {
      for (const token of leftovers) reportLeftover(state, token);
    }
  }

  return { items, declaredTotal, declaredStyle, issues: state.issues, normalized: cleaned };
}

function readBareTotal(tokens) {
  if (tokens.length === 1 && tokens[0].kind === TOKEN.NUMBER) return { value: tokens[0].value };
  if (tokens.length === 2 && tokens[0].kind === TOKEN.NUMBER && tokens[1].kind === TOKEN.WORD) {
    if (/^(?:sts?|stitches?)$/i.test(tokens[1].value)) return { value: tokens[0].value };
  }
  return null;
}

function reportLeftover(state, token) {
  if (token.kind === TOKEN.NUMBER) {
    state.issues.push({
      severity: SEVERITY.FIX,
      message: `I couldn’t tell whether “${token.raw ?? token.value}” is a stitch count or a total.`
    });
    return;
  }
  if (token.kind === TOKEN.WORD) {
    const suggestion = suggestStitch(token.value);
    state.issues.push({
      severity: SEVERITY.FIX,
      message: suggestion
        ? `I don’t know the word “${token.value}”. Did you mean ${suggestion.definition.type} (${suggestion.definition.label.toLowerCase()})?`
        : `I don’t know the word “${token.value}”.`,
      suggestion: suggestion ? { word: token.value, type: suggestion.definition.type } : null
    });
    return;
  }
  if (token.kind === TOKEN.UNKNOWN) {
    state.issues.push({ severity: SEVERITY.FIX, message: `I don’t know the character “${token.value}”.` });
  }
}

function parseSequence(state, insideGroup) {
  const items = [];
  while (state.position < state.tokens.length) {
    const token = state.tokens[state.position];

    if (token.kind === TOKEN.SEPARATOR || token.kind === TOKEN.COLON) {
      state.position += 1;
      continue;
    }

    if (token.kind === TOKEN.RPAREN) {
      if (insideGroup) return items;
      state.issues.push({ severity: SEVERITY.FIX, message: "There is a “)” with no matching “(”." });
      state.position += 1;
      continue;
    }

    const item = parseItem(state);
    if (item === SKIP) continue;
    if (!item) break;
    items.push(item);
  }

  if (insideGroup) {
    state.issues.push({ severity: SEVERITY.FIX, message: "This group was never closed with a “)”." });
  }
  return items;
}

function parseItem(state) {
  const token = state.tokens[state.position];
  if (!token) return null;

  if (token.kind === TOKEN.LPAREN) return applyRepeat(state, parseGroup(state));

  if (token.kind === TOKEN.NUMBER) {
    // A number with nothing behind it is a declared total, not an instruction:
    // stop here so the caller can read it as one.
    if (readBareTotal(state.tokens.slice(state.position))) return null;

    const next = state.tokens[state.position + 1];
    if (next?.kind === TOKEN.LPAREN) {
      state.position += 1;
      return repeatOf(state, parseGroup(state), token.value);
    }
    // The count sits before the stitch, so look for the stitch word starting
    // at the next token rather than at the number itself.
    const words = upcomingWords(state, state.position + 1);
    if (words.length && matchStitch(words, 0)) {
      state.position += 1;
      return parseStitchRun(state, token.value);
    }
    state.issues.push({
      severity: SEVERITY.FIX,
      message: `The number “${token.raw ?? token.value}” is not followed by a stitch I know.`
    });
    state.position += 1;
    return SKIP;
  }

  if (token.kind === TOKEN.STAR || token.kind === TOKEN.WORD) {
    if (token.kind === TOKEN.STAR || isRepeatOperator(token.value)) {
      state.issues.push({ severity: SEVERITY.FIX, message: `A “${token.value}” needs something to repeat before it.` });
      state.position += 1;
      // The count belongs to the orphaned operator. Leaving it behind would
      // make it look like the round's declared total.
      if (state.tokens[state.position]?.kind === TOKEN.NUMBER) state.position += 1;
      return SKIP;
    }
    // A single stitch can also be repeated: "SC x 4".
    return applyRepeat(state, parseStitchRun(state, 1));
  }

  state.position += 1;
  return SKIP;
}

function parseGroup(state) {
  state.position += 1; // consume "("
  const body = parseSequence(state, true);
  if (state.tokens[state.position]?.kind === TOKEN.RPAREN) state.position += 1;
  return { type: "group", body };
}

function parseStitchRun(state, countHint) {
  const words = upcomingWords(state);
  const match = words.length ? matchStitch(words, 0) : null;

  if (!match) {
    const token = state.tokens[state.position];
    const word = token?.value ?? "";
    const suggestion = suggestStitch(word);
    state.issues.push({
      severity: SEVERITY.FIX,
      message: suggestion
        ? `I don’t know the word “${word}”. Did you mean ${suggestion.definition.type} (${suggestion.definition.label.toLowerCase()})?`
        : `I don’t know the word “${word}”.`,
      suggestion: suggestion && token?.kind === TOKEN.WORD ? { word, type: suggestion.definition.type } : null
    });
    state.position += 1;
    return SKIP;
  }

  state.position += match.length;
  const placement = readPlacement(state);
  const count = clampCount(state, countHint);
  return { type: "stitch", stitch: match.definition.type, count, placement };
}

function readPlacement(state) {
  const token = state.tokens[state.position];
  if (!token || token.kind !== TOKEN.WORD) return null;
  if (!["in", "into", "on"].includes(token.value.toLowerCase())) return null;

  state.position += 1;
  const parts = [];
  while (state.position < state.tokens.length) {
    const next = state.tokens[state.position];
    if (next.kind === TOKEN.WORD && PLACEMENT_WORDS.has(next.value.toLowerCase())) {
      parts.push(next.value.toLowerCase());
      state.position += 1;
      continue;
    }
    // "in 3rd chain from hook" — one number is allowed inside a placement.
    if (next.kind === TOKEN.NUMBER && parts.length === 0) {
      parts.push(String(next.value));
      state.position += 1;
      continue;
    }
    break;
  }
  return parts.length ? parts.join(" ") : null;
}

function applyRepeat(state, item) {
  const token = state.tokens[state.position];
  if (!token) return item;

  const isOperator = token.kind === TOKEN.STAR || (token.kind === TOKEN.WORD && isRepeatOperator(token.value));
  if (isOperator) {
    const number = state.tokens[state.position + 1];
    if (number?.kind === TOKEN.NUMBER) {
      state.position += 2;
      return repeatOf(state, item, number.value);
    }
    state.issues.push({ severity: SEVERITY.FIX, message: `The “${token.value}” needs a number after it, like × 6.` });
    state.position += 1;
    return item;
  }

  // "(1 SC, INC) 6" — count straight after the group.
  if (item.type === "group" && token.kind === TOKEN.NUMBER) {
    state.position += 1;
    return repeatOf(state, item, token.value);
  }

  return item;
}

function repeatOf(state, item, count) {
  const body = item.type === "group" ? item.body : [item];
  return { type: "repeat", count: clampCount(state, count), body };
}

function clampCount(state, raw) {
  const value = Math.trunc(Number(raw));
  if (!Number.isFinite(value) || value < 1) return 1;
  if (value <= MAX_COUNT) return value;
  state.issues.push({
    severity: SEVERITY.FIX,
    message: `“${raw}” is more repeats than I can expand, so I stopped at ${MAX_COUNT}.`
  });
  return MAX_COUNT;
}

function upcomingWords(state, start = state.position) {
  const words = [];
  for (let index = start; index < state.tokens.length; index += 1) {
    const token = state.tokens[index];
    if (token.kind !== TOKEN.WORD) break;
    words.push(token.value);
  }
  return words;
}
