import { TOKEN, SEVERITY, isItemRepeatOperator, isWholeRepeatWord, isRepeatOperator } from "./grammar.js";
import { cleanLine } from "./normalizer.js";
import { tokenize } from "./tokenizer.js";
import { PLACEMENT_WORDS, matchStitch, suggestStitch } from "./stitch-registry.js";

const SKIP = Symbol("skip");

// Upper bound on how many times one instruction may repeat. A mistyped count
// ("× 600") must not build a round of thousands of stitches in the browser.
const MAX_COUNT = 1000;

// --- labels -----------------------------------------------------------------

// Lenient label split used when a whole pattern is read line by line.
export function splitLabel(line) {
  const text = String(line ?? "").trim();

  const explicit = text.match(/^(round|rnd|rnds|row|rows|r|runde)\s*#?\s*(\d+)\s*(?:[:.)\-]\s*)?(.*)$/i);
  if (explicit && explicit[3].trim()) {
    const word = /row/i.test(explicit[1]) ? "Row" : "Round";
    return { label: `${word} ${explicit[2]}`, instruction: explicit[3].trim() };
  }

  const numbered = text.match(/^(\d+)\s*[.):\-]\s+(.+)$/);
  if (numbered) return { label: `Round ${numbered[1]}`, instruction: numbered[2].trim() };

  // A round number with no punctuation is only trusted when a second number or
  // a group follows it, so "6 SC" can never be read as "Round 6".
  const bare = text.match(/^(\d+)\s+(?=\(|\d+\b)(.+)$/);
  if (bare) return { label: `Round ${bare[1]}`, instruction: bare[2].trim() };

  const named = text.match(/^([A-Za-z][A-Za-z0-9 '’\-]{0,26})\s*:\s*(.+)$/);
  if (named) {
    const words = named[1].trim().split(/\s+/);
    if (!matchStitch(words, 0)) return { label: named[1].trim(), instruction: named[2].trim() };
  }

  return { label: null, instruction: text };
}

// Strict label strip used inside parseLine, so a label can never be counted as
// an instruction: "Round 3: 6 SC", "R3. 6 SC", "3) 6 SC".
function stripLabel(text) {
  const explicit = text.match(/^(?:round|rnd|rnds|row|rows|r|runde)\s*#?\s*(\d+)\s*[:.)\-]?\s+(.+)$/i);
  if (explicit) return explicit[2].trim();
  const numbered = text.match(/^(\d+)\s*[.):\-]\s+(.+)$/);
  if (numbered) return numbered[2].trim();
  return text;
}

// --- declared totals ---------------------------------------------------------

// Pull a declared output total off the end of a line. "Total: 24" is handled by
// the pattern reader, because it stands on its own line.
export function parseDeclaration(source) {
  const text = String(source ?? "");
  const bracket = text.match(/\(\s*(\d+)\s*(?:sts?|stitches?)?\s*\)\s*$/i);
  if (bracket) {
    return { declaredTotal: Number(bracket[1]), declaredStyle: "bracket", text: text.slice(0, bracket.index).trim() };
  }
  const equals = text.match(/(?:=|total(?:s)?(?:\s+of)?|there\s+are)\s*[:=]?\s*(\d+)\s*(?:sts?|stitches?)?\s*$/i);
  if (equals) {
    return { declaredTotal: Number(equals[1]), declaredStyle: "equals", text: text.slice(0, equals.index).trim() };
  }
  return { declaredTotal: null, declaredStyle: null, text };
}

// --- line parsing ------------------------------------------------------------

// "sc around" / "sc in each st around" cannot be counted from the line alone:
// the number of repeats comes from the round before.
function extractFillMode(text) {
  let body = String(text ?? "");
  let fill = false;

  const around = /\b(?:all\s+)?around(?:\s+the\s+(?:ring|round))?\s*$/i;
  if (around.test(body)) {
    body = body.replace(around, "").trim();
    fill = true;
  }
  if (/\b(?:each|every)\s+(?:st|stitch|sts|stitches)\b/i.test(body)) fill = true;

  return { text: body, fill };
}

// Parse one instruction into an ordered AST. Never throws: problems become
// issues so the line can still be shown with whatever could be read.
export function parseLine(source) {
  const cleaned = cleanLine(source);
  const body = stripLabel(cleaned.text);
  const declaration = parseDeclaration(body);
  const fill = extractFillMode(declaration.text);

  const tokens = tokenize(fill.text);
  const state = { tokens, position: 0, issues: [] };
  if (cleaned.mixedBrackets) {
    state.issues.push({
      severity: SEVERITY.FIX,
      message: "The brackets are mixed, like “( ]”. Use matching ( ) or [ ] so I know what repeats."
    });
  }

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

  return {
    items,
    declaredTotal,
    declaredStyle,
    issues: state.issues,
    normalized: cleaned.text,
    fillPrevious: fill.fill
  };
}

function readBareTotal(tokens) {
  if (tokens.length === 1 && tokens[0].kind === TOKEN.NUMBER && !tokens[0].ordinal) return { value: tokens[0].value };
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

function isRepeatToken(token) {
  return Boolean(token) && (token.kind === TOKEN.STAR || (token.kind === TOKEN.WORD && isRepeatOperator(token.value)));
}

// "x 6" sits next to the instruction it repeats; "repeat 6" repeats the line.
function isItemRepeatToken(token) {
  return Boolean(token) && (token.kind === TOKEN.STAR || (token.kind === TOKEN.WORD && isItemRepeatOperator(token.value)));
}

function isWholeRepeatToken(token) {
  return Boolean(token) && token.kind === TOKEN.WORD && isWholeRepeatWord(token.value);
}

function parseSequence(state, insideGroup) {
  const items = [];
  let repeatedWhole = false;
  let flaggedAfterRepeat = false;

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

    // "1 SC, INC repeat 6 times" / "… , x 6": the repeat covers everything
    // written before it. Anything written after it is ambiguous.
    if (items.length && isRepeatToken(token)) {
      state.position += 1;
      const number = state.tokens[state.position];
      if (number?.kind === TOKEN.NUMBER) {
        state.position += 1;
        const body = items.splice(0, items.length);
        items.push({ type: "repeat", count: clampCount(state, number.value), body });
        repeatedWhole = true;
        continue;
      }
      state.issues.push({ severity: SEVERITY.FIX, message: `The “${token.value}” needs a number after it, like × 6.` });
      continue;
    }

    const item = parseItem(state);
    if (item === SKIP) continue;
    if (!item) break;

    if (repeatedWhole && !flaggedAfterRepeat) {
      flaggedAfterRepeat = true;
      state.issues.push({
        severity: SEVERITY.FIX,
        message: "Instructions follow a repeat, so I can’t tell what the repeat covers. Put brackets around the repeated part."
      });
    }
    items.push(item);
  }

  if (insideGroup) {
    state.issues.push({ severity: SEVERITY.FIX, message: "This group was never closed with a “)”. " });
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
    if (isRepeatToken(token)) {
      state.issues.push({ severity: SEVERITY.FIX, message: `A “${token.value}” needs something to repeat before it.` });
      state.position += 1;
      // The count belongs to the orphaned operator. Leaving it behind would
      // make it look like the round's declared total.
      if (state.tokens[state.position]?.kind === TOKEN.NUMBER) state.position += 1;
      return SKIP;
    }
    // A single stitch can also be repeated: "SC x 4".
    return applyRepeat(state, parseStitchRun(state));
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

function parseStitchRun(state, countHint = null) {
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

  // Count before the stitch ("6 SC"), inside the placement ("in next 2 sts"),
  // or after it ("ch 3", "sc 12").
  let count = countHint;
  if (count == null && placement?.count != null) count = placement.count;
  if (count == null) {
    const next = state.tokens[state.position];
    if (next?.kind === TOKEN.NUMBER && !next.ordinal) {
      count = next.value;
      state.position += 1;
    }
  }

  return {
    type: "stitch",
    stitch: match.definition.type,
    count: clampCount(state, count == null ? 1 : count),
    placement: placement?.text ?? null
  };
}

function readPlacement(state) {
  const token = state.tokens[state.position];
  if (!token || token.kind !== TOKEN.WORD) return null;
  if (!["in", "into", "on"].includes(token.value.toLowerCase())) return null;

  state.position += 1;
  const parts = [];
  let count = null;
  let sawNumber = false;

  while (state.position < state.tokens.length) {
    const next = state.tokens[state.position];

    if (next.kind === TOKEN.WORD && PLACEMENT_WORDS.has(next.value.toLowerCase())) {
      parts.push(next.value.toLowerCase());
      state.position += 1;
      continue;
    }

    // One number is allowed inside a placement: "in 3rd ch from hook",
    // "in the next 2 sts". A plural stitch word after it is its count.
    if (next.kind === TOKEN.NUMBER && !sawNumber) {
      sawNumber = true;
      parts.push(next.raw ?? String(next.value));
      state.position += 1;
      const after = state.tokens[state.position];
      if (!next.ordinal && after?.kind === TOKEN.WORD && /^(?:sts|stitches|spaces)$/i.test(after.value)) {
        count = next.value;
        parts.push(after.value.toLowerCase());
        state.position += 1;
      }
      continue;
    }

    break;
  }

  return parts.length ? { text: parts.join(" "), count } : null;
}

function applyRepeat(state, item) {
  const token = state.tokens[state.position];
  if (!token) return item;

  if (isItemRepeatToken(token)) {
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
  if (item.type === "group" && token.kind === TOKEN.NUMBER && !token.ordinal) {
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
  if (!Number.isFinite(value) || value < 1) {
    state.issues.push({
      severity: SEVERITY.FIX,
      message: `The count “${raw}” needs to be a whole number of at least 1.`
    });
    return 1;
  }
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
