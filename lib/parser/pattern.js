import { SEVERITY, worstSeverity } from "./grammar.js";
import { matchStitch } from "./stitch-registry.js";
import { parseLine } from "./parser.js";
import { calculateItems, describeWorkings } from "./stitch-calculator.js";
import { startsInRing } from "./expander.js";
import { validateRound } from "./validator.js";

// Pattern-level parsing: line labels, tables pasted from the web, and the
// draft shape the app turns into runtime rounds.

export function parseRoundDraft(label, instruction, { outputStart = 1 } = {}) {
  const parsed = parseLine(instruction);
  const calculated = calculateItems(parsed.items, { outputStart });
  const workings = describeWorkings(parsed.items, calculated.outputCount);
  const validation = validateRound({ items: parsed.items, parsed, calculated, workings });

  const warning = validation.issues
    .filter((issue) => issue.severity === SEVERITY.FIX || issue.severity === SEVERITY.CHECK)
    .map((issue) => issue.message)
    .join(" ");

  return {
    label,
    title: label,
    instruction: String(instruction ?? "").trim(),
    normalized: parsed.normalized,
    operations: calculated.operations,
    inputCount: calculated.inputCount,
    outputCount: calculated.outputCount,
    worksIntoRing: startsInRing(parsed.items),
    declaredTotal: validation.declaredTotal,
    declaredStyle: parsed.declaredStyle,
    issues: validation.issues,
    status: validation.status,
    blocked: validation.blocked,
    workings: validation.workings,
    warning
  };
}

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

// A total from a pasted table is compared exactly like one written in brackets:
// it is recorded and, when it disagrees, reported without changing the count.
function applyTableTotal(draft, total) {
  draft.declaredTotal = total;
  if (draft.outputCount === total) return draft;
  const message = `Table total is ${total}; the instructions produce ${draft.outputCount}.`;
  draft.issues = [...draft.issues, { severity: SEVERITY.CHECK, message, action: "use-counted" }];
  draft.status = worstSeverity(draft.issues.map((issue) => issue.severity));
  draft.warning = [draft.warning, message].filter(Boolean).join(" ");
  return draft;
}

function parseColumnarTable(sourceLines) {
  const cells = sourceLines
    .map((line) =>
      line
        .replace(/&#x20;|&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/^\s*\|+|\|+\s*$/g, "")
        .trim()
    )
    .filter((cell) => cell && !/^:?-{1,}:?$/.test(cell));

  const headerIndex = cells.findIndex(
    (cell, index) =>
      /^round$/i.test(cell) &&
      /^instructions?$/i.test(cells[index + 1] || "") &&
      /^total\s+stitches$/i.test(cells[index + 2] || "")
  );
  if (headerIndex < 0) return null;

  const rounds = [];
  const warnings = [];
  const data = cells.slice(headerIndex + 3);
  for (let index = 0; index + 2 < data.length; index += 3) {
    const roundMatch = data[index].match(/^(?:round\s*)?(\d+)$/i);
    const totalMatch = data[index + 2].match(/^(\d+)$/);
    const instruction = data[index + 1].trim();
    if (!roundMatch || !totalMatch || !instruction) {
      warnings.push(`Couldn’t read table cells near “${data[index]}”. Keep each round, instruction, and total in its own cell.`);
      continue;
    }
    const draft = applyTableTotal(parseRoundDraft(`Round ${roundMatch[1]}`, instruction), Number(totalMatch[1]));
    if (draft.warning) warnings.push(`${draft.label}: ${draft.warning}`);
    rounds.push(draft);
  }
  if (!rounds.length) warnings.push("No round rows were found after the table header.");
  return { rounds, warnings };
}

export function parsePattern(source, { startRound = 1 } = {}) {
  const sourceLines = String(source ?? "").split(/\r?\n/);
  const columnar = parseColumnarTable(sourceLines);
  if (columnar) return columnar;

  const rounds = [];
  const warnings = [];
  const headerIndex = sourceLines.findIndex((line) => /round/i.test(line) && /instructions?/i.test(line) && /total/i.test(line));
  const tableMode = headerIndex >= 0 || sourceLines.some((line) => line.includes("|"));
  const dataLines = headerIndex >= 0 ? sourceLines.slice(headerIndex + 1) : sourceLines;
  let fallback = startRound;

  for (const rawLine of dataLines) {
    const line = String(rawLine).replace(/\u00a0/g, " ").trim();
    if (!line) continue;
    if (/^\|?\s*:?-{2,}/.test(line) || /^\|?[\s|:-]+\|?$/.test(line)) continue;

    if (tableMode && line.includes("|")) {
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 3) {
        const roundNumber = cells[0].match(/\d+/)?.[0];
        const total = Number(cells[2].match(/\d+/)?.[0]);
        if (!roundNumber || !Number.isFinite(total)) continue;
        const draft = applyTableTotal(parseRoundDraft(`Round ${roundNumber}`, cells[1]), total);
        rounds.push(draft);
        fallback += 1;
        continue;
      }
    }

    if (tableMode) {
      const row = line.match(/^\|?\s*(?:round\s*)?(\d+)\s+(.+?)\s+(\d+)\s*\|?$/i);
      if (row) {
        const draft = applyTableTotal(parseRoundDraft(`Round ${row[1]}`, row[2]), Number(row[3]));
        rounds.push(draft);
        fallback += 1;
        continue;
      }
    }

    const { label, instruction } = splitLabel(line);
    const draft = parseRoundDraft(label || `Round ${fallback}`, instruction);
    if (draft.warning) warnings.push(`${draft.label}: ${draft.warning}`);
    rounds.push(draft);
    fallback += 1;
  }

  if (!rounds.length) warnings.push("Add at least one round or row of instructions.");
  return { rounds, warnings };
}
