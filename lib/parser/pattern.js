import { SEVERITY, worstSeverity } from "./grammar.js";
import { parseLine, splitLabel } from "./parser.js";
import { calculateItems, describeWorkings } from "./stitch-calculator.js";
import { startsInRing } from "./expander.js";
import { validateRound } from "./validator.js";

// Pattern-level parsing: line labels, tables pasted from the web, and the
// draft shape the app turns into runtime rounds.
//
// Rounds are read in order because two things depend on the round before:
// "sc in each st around" (how many times) and the chain check (whether this
// round consumes exactly what the previous one produced).

export { splitLabel };

export function parseRoundDraft(label, instruction, { outputStart = 1, previousOutput = null, previousLabel = null } = {}) {
  const parsed = parseLine(instruction);
  const extraIssues = [];
  let items = parsed.items;
  let inferredMessage = "";

  // "sc in each st around", "2 sc in next st around": repeat the clause enough
  // times to work into every stitch of the round before.
  if (parsed.fillPrevious) {
    const clause = calculateItems(items, { outputStart });
    if (!previousOutput) {
      extraIssues.push({
        severity: SEVERITY.FIX,
        message: "This line works into every stitch of the round before, but there is no round before it to count."
      });
    } else if (clause.inputCount < 1) {
      extraIssues.push({
        severity: SEVERITY.FIX,
        message: "I can’t tell how many stitches this line works into, so I can’t spread it around the round."
      });
    } else if (previousOutput % clause.inputCount !== 0) {
      extraIssues.push({
        severity: SEVERITY.FIX,
        message: `${previousLabel || "The round before"} ends with ${previousOutput} stitches, which doesn’t divide evenly into steps of ${clause.inputCount}.`
      });
    } else {
      const repeats = previousOutput / clause.inputCount;
      items = [{ type: "repeat", count: repeats, body: items }];
      const produced = calculateItems(items, { outputStart }).outputCount;
      inferredMessage = `Worked into every stitch: repeated ${repeats} times to fill ${previousOutput} stitches${previousLabel ? ` of ${previousLabel}` : ""}, making ${produced}.`;
      extraIssues.push({ severity: SEVERITY.INFERRED, message: inferredMessage });
    }
  }

  const calculated = calculateItems(items, { outputStart });
  const worksIntoRing = startsInRing(items);
  // A round that begins in a magic ring consumes nothing from a previous round,
  // so it starts a piece and is exempt from the chain check.
  const inputCount = worksIntoRing ? 0 : calculated.inputCount;
  const workings = describeWorkings(items, calculated.outputCount);
  const validation = validateRound({
    items,
    parsed: { ...parsed, issues: [...parsed.issues, ...extraIssues] },
    calculated,
    workings
  });

  const issues = [...validation.issues];
  if (previousOutput != null && !parsed.fillPrevious && !worksIntoRing && calculated.operations.length && inputCount !== previousOutput) {
    issues.push({
      severity: SEVERITY.CHECK,
      message: `${label} works into ${inputCount} stitches, but ${previousLabel || "the round before"} ends with ${previousOutput}.`,
      action: "review-chain"
    });
  }

  const status = worstSeverity(issues.map((issue) => issue.severity));
  const warning = issues
    .filter((issue) => issue.severity === SEVERITY.FIX || issue.severity === SEVERITY.CHECK)
    .map((issue) => issue.message)
    .join(" ");

  return {
    label,
    title: label,
    instruction: String(instruction ?? "").trim(),
    normalized: parsed.normalized,
    operations: calculated.operations,
    inputCount,
    outputCount: calculated.outputCount,
    worksIntoRing,
    fillPrevious: parsed.fillPrevious,
    declaredTotal: validation.declaredTotal,
    declaredStyle: parsed.declaredStyle,
    issues,
    status,
    blocked: issues.some((issue) => issue.severity === SEVERITY.FIX),
    workings: validation.workings,
    warning,
    inferredMessage
  };
}

// A total written outside the instruction line — a pasted table cell or a
// "Total: 24" row — is compared exactly like one in brackets: recorded, and
// reported when it disagrees, without changing the counted sequence.
function applyDeclaredTotal(draft, total) {
  if (!draft) return draft;
  draft.declaredTotal = total;
  if (draft.outputCount === total) return draft;
  const message = `${draft.label} says ${total} stitches, but the instructions produce ${draft.outputCount}.`;
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
  let previous = null;

  for (let index = 0; index + 2 < data.length; index += 3) {
    const roundMatch = data[index].match(/^(?:round\s*)?(\d+)$/i);
    const totalMatch = data[index + 2].match(/^(\d+)$/);
    const instruction = data[index + 1].trim();
    if (!roundMatch || !totalMatch || !instruction) {
      warnings.push(`Couldn’t read table cells near “${data[index]}”. Keep each round, instruction, and total in its own cell.`);
      continue;
    }
    const draft = applyDeclaredTotal(
      parseRoundDraft(`Round ${roundMatch[1]}`, instruction, {
        previousOutput: previous?.outputCount ?? null,
        previousLabel: previous?.label ?? null
      }),
      Number(totalMatch[1])
    );
    if (draft.warning) warnings.push(`${draft.label}: ${draft.warning}`);
    rounds.push(draft);
    previous = draft;
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
  let previous = null;

  const push = (draft) => {
    if (draft.warning) warnings.push(`${draft.label}: ${draft.warning}`);
    rounds.push(draft);
    previous = draft;
    fallback += 1;
  };

  for (const rawLine of dataLines) {
    const line = String(rawLine).replace(/\u00a0/g, " ").trim();
    if (!line) continue;
    if (/^\|?\s*:?-{2,}/.test(line) || /^\|?[\s|:-]+\|?$/.test(line)) continue;

    // A "Total: 24" summary row belongs to the round above it, not to a round.
    if (/^total\b/i.test(line)) {
      const total = line.match(/(\d+)/);
      if (total && previous) applyDeclaredTotal(previous, Number(total[1]));
      continue;
    }

    if (tableMode && line.includes("|")) {
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 3) {
        const roundNumber = cells[0].match(/\d+/)?.[0];
        const total = Number(cells[2].match(/\d+/)?.[0]);
        if (!roundNumber || !Number.isFinite(total)) continue;
        push(
          applyDeclaredTotal(
            parseRoundDraft(`Round ${roundNumber}`, cells[1], {
              previousOutput: previous?.outputCount ?? null,
              previousLabel: previous?.label ?? null
            }),
            total
          )
        );
        continue;
      }
    }

    if (tableMode) {
      const row = line.match(/^\|?\s*(?:round\s*)?(\d+)\s+(.+?)\s+(\d+)\s*\|?$/i);
      if (row) {
        push(
          applyDeclaredTotal(
            parseRoundDraft(`Round ${row[1]}`, row[2], {
              previousOutput: previous?.outputCount ?? null,
              previousLabel: previous?.label ?? null
            }),
            Number(row[3])
          )
        );
        continue;
      }
    }

    const { label, instruction } = splitLabel(line);
    push(
      parseRoundDraft(label || `Round ${fallback}`, instruction, {
        previousOutput: previous?.outputCount ?? null,
        previousLabel: previous?.label ?? null
      })
    );
  }

  if (!rounds.length) warnings.push("Add at least one round or row of instructions.");
  return { rounds, warnings };
}
