import test from "node:test";
import assert from "node:assert/strict";

import { parseLine } from "../lib/parser/parser.js";
import { parsePattern, splitLabel } from "../lib/parser/pattern.js";
import { calculateItems } from "../lib/parser/stitch-calculator.js";
import { startsInRing } from "../lib/parser/expander.js";
import { SEVERITY } from "../lib/parser/grammar.js";

function parse(text) {
  const parsed = parseLine(text);
  const calculated = calculateItems(parsed.items);
  return {
    parsed,
    operations: calculated.operations,
    inputCount: calculated.inputCount,
    outputCount: calculated.outputCount,
    types: calculated.operations.map((operation) => operation.type),
    inputs: calculated.operations.map((operation) => operation.inputCount),
    outputs: calculated.operations.map((operation) => operation.outputCount)
  };
}

function countByType(types) {
  return types.reduce((counts, type) => ({ ...counts, [type]: (counts[type] || 0) + 1 }), {});
}

// --- basic quantities -------------------------------------------------------

test("1 SC is one operation", () => {
  const result = parse("1 SC");
  assert.deepEqual(result.types, ["SC"]);
  assert.equal(result.inputCount, 1);
  assert.equal(result.outputCount, 1);
});

test("6 SC is six operations", () => {
  const result = parse("6 SC");
  assert.equal(result.operations.length, 6);
  assert.deepEqual(countByType(result.types), { SC: 6 });
  assert.equal(result.inputCount, 6);
  assert.equal(result.outputCount, 6);
});

test("12 DC keeps the stitch type and count", () => {
  const result = parse("12 DC");
  assert.deepEqual(countByType(result.types), { DC: 12 });
  assert.equal(result.inputCount, 12);
  assert.equal(result.outputCount, 12);
});

// --- basic operations -------------------------------------------------------

test("SC, INC and DEC use their own input/output rules", () => {
  assert.deepEqual(parse("SC").outputs, [1]);
  assert.deepEqual(parse("INC").inputs, [1]);
  assert.deepEqual(parse("INC").outputs, [2]);
  assert.deepEqual(parse("DEC").inputs, [2]);
  assert.deepEqual(parse("DEC").outputs, [1]);
});

// --- repetition groups ------------------------------------------------------

test("(1 SC, INC) × 1 expands once", () => {
  const result = parse("(1 SC, INC) × 1");
  assert.deepEqual(result.types, ["SC", "INC"]);
  assert.equal(result.inputCount, 2);
  assert.equal(result.outputCount, 3);
});

test("(1 SC, INC) × 3 expands three times in order", () => {
  const result = parse("(1 SC, INC) × 3");
  assert.deepEqual(result.types, ["SC", "INC", "SC", "INC", "SC", "INC"]);
  assert.equal(result.inputCount, 6);
  assert.equal(result.outputCount, 9);
});

test("(1 SC, INC) × 6 keeps both members of every repeat", () => {
  const result = parse("(1 SC, INC) × 6");
  assert.equal(result.operations.length, 12);
  assert.deepEqual(countByType(result.types), { SC: 6, INC: 6 });
  assert.equal(result.inputCount, 12);
  assert.equal(result.outputCount, 18);
});

test("(2 SC, INC) × 6 expands to 12 SC and 6 INC", () => {
  const result = parse("(2 SC, INC) × 6");
  assert.equal(result.operations.length, 18);
  assert.deepEqual(countByType(result.types), { SC: 12, INC: 6 });
  assert.equal(result.inputCount, 18);
  assert.equal(result.outputCount, 24);
  assert.deepEqual(result.types.slice(0, 3), ["SC", "SC", "INC"]);
});

test("(3 SC, INC) × 6 expands to 18 SC and 6 INC", () => {
  const result = parse("(3 SC, INC) × 6");
  assert.equal(result.operations.length, 24);
  assert.deepEqual(countByType(result.types), { SC: 18, INC: 6 });
  assert.equal(result.inputCount, 24);
  assert.equal(result.outputCount, 30);
});

test("repetition keeps the first and last instruction of a group", () => {
  const result = parse("(1 SC, 4 HDC, INC) × 3");
  assert.equal(result.operations.length, 18);
  assert.deepEqual(countByType(result.types), { SC: 3, HDC: 12, INC: 3 });
  assert.deepEqual(result.types.slice(0, 3), ["SC", "HDC", "HDC"]);
  assert.equal(result.types.at(-1), "INC");
});

// --- mixed instruction sequences -------------------------------------------

test("2 SC, INC, 3 SC keeps the written order", () => {
  const result = parse("2 SC, INC, 3 SC");
  assert.deepEqual(result.types, ["SC", "SC", "INC", "SC", "SC", "SC"]);
  assert.equal(result.inputCount, 6);
  assert.equal(result.outputCount, 7);
});

test("2 SC, INC, (5 SC, INC) × 5, 3 SC adds up to 42", () => {
  const result = parse("2 SC, INC, (5 SC, INC) × 5, 3 SC");
  assert.equal(result.outputCount, 42);
  assert.equal(result.inputCount, 36);
  assert.deepEqual(countByType(result.types), { SC: 30, INC: 6 });
});

test("3 SC, INC, (6 SC, INC) × 5, 3 SC adds up to 48", () => {
  const result = parse("3 SC, INC, (6 SC, INC) × 5, 3 SC");
  assert.equal(result.outputCount, 48);
  assert.equal(result.inputCount, 42);
  assert.deepEqual(countByType(result.types), { SC: 36, INC: 6 });
  assert.deepEqual(result.types.slice(0, 4), ["SC", "SC", "SC", "INC"]);
  assert.deepEqual(result.types.slice(-3), ["SC", "SC", "SC"]);
});

// --- multiple and nested groups --------------------------------------------

test("two groups in one line both expand", () => {
  const result = parse("(2 SC, INC) × 3, (3 SC, INC) × 2");
  assert.equal(result.operations.length, 17);
  assert.deepEqual(countByType(result.types), { SC: 12, INC: 5 });
  assert.equal(result.inputCount, 17);
  assert.equal(result.outputCount, 22);
});

test("nested groups expand inside out", () => {
  const result = parse("((1 SC, INC) × 2, 3 SC) × 3");
  assert.equal(result.operations.length, 21);
  assert.deepEqual(countByType(result.types), { SC: 15, INC: 6 });
  assert.equal(result.inputCount, 21);
  assert.equal(result.outputCount, 27);
});

// --- notation variants ------------------------------------------------------

test("x, × and star-repeat notation all mean the same thing", () => {
  const expected = ["SC", "INC", "SC", "INC"];
  assert.deepEqual(parse("(1 SC, INC) x 2").types, expected);
  assert.deepEqual(parse("(1 SC, INC) × 2").types, expected);
  assert.deepEqual(parse("*1 SC, INC* repeat 2 times").types, expected);
  assert.deepEqual(parse("(1 SC, INC) x2").types, expected);
});

test("spacing and lower case do not change the reading", () => {
  const result = parse("( 1  sc ,inc )×6");
  assert.equal(result.operations.length, 12);
  assert.equal(result.outputCount, 18);
});

test("multi-word abbreviations are read as one stitch", () => {
  assert.deepEqual(parse("3 sl st").types, ["SLST", "SLST", "SLST"]);
  assert.deepEqual(parse("2 blo sc").types, ["BLOSC", "BLOSC"]);
  assert.deepEqual(parse("4 single crochet").types, ["SC", "SC", "SC", "SC"]);
});

test("stitch x count is read as a repeat", () => {
  const result = parse("SC x 4");
  assert.deepEqual(result.types, ["SC", "SC", "SC", "SC"]);
});

// --- expected totals --------------------------------------------------------

test("a bracketed total is extracted, not used as an instruction", () => {
  const result = parse("3 SC, INC, (6 SC, INC) × 5, 3 SC (48)");
  assert.equal(result.parsed.declaredTotal, 48);
  assert.equal(result.parsed.declaredStyle, "bracket");
  assert.equal(result.outputCount, 48);
  assert.equal(result.operations.length, 42);
});

test("a bracketed total that disagrees is kept for comparison", () => {
  const result = parse("3 SC, INC, (6 SC, INC) × 5, 3 SC (45)");
  assert.equal(result.parsed.declaredTotal, 45);
  assert.equal(result.outputCount, 48);
});

test("a bare trailing number is read as a total and flagged", () => {
  const result = parse("4 SC, INC, (7 SC, INC) × 5, 3 SC 54");
  assert.equal(result.parsed.declaredTotal, 54);
  assert.equal(result.parsed.declaredStyle, "bare");
  assert.equal(result.outputCount, 54);
});

test("= and total of are accepted for the declared total", () => {
  assert.equal(parse("(1 SC, INC) × 6 = 18").parsed.declaredTotal, 18);
  assert.equal(parse("(1 SC, INC) × 6 total of 18").parsed.declaredTotal, 18);
});

// --- magic ring -------------------------------------------------------------

test("6 SC in MR makes six stitches into a ring", () => {
  const result = parse("6 SC in MR");
  assert.equal(result.operations.length, 6);
  assert.equal(result.outputCount, 6);
  assert.equal(startsInRing(result.parsed.items), true);
  assert.equal(result.parsed.declaredStyle, null);
});

// --- malformed input --------------------------------------------------------

test("an unknown word is reported with a suggestion", () => {
  const result = parse("4 SC, INC, (8 SC, INK) × 5, 4 SC (60)");
  const issue = result.parsed.issues.find((item) => item.severity === SEVERITY.FIX);
  assert.ok(issue, "expected a fix issue");
  assert.match(issue.message, /INK/);
  assert.equal(issue.suggestion?.type, "INC");
});

test("an unclosed group is reported", () => {
  const result = parse("(1 SC, INC × 6");
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX));
});

test("a repeat without a count is reported", () => {
  const result = parse("(1 SC, INC) ×");
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX));
});

test("a number with no stitch behind it is reported", () => {
  const result = parse("4 SC 12 8");
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX));
});

// --- pattern level ----------------------------------------------------------

test("round labels are read from the common forms", () => {
  assert.deepEqual(splitLabel("R1: 6 SC in MR"), { label: "Round 1", instruction: "6 SC in MR" });
  assert.deepEqual(splitLabel("Round 4: 24 SC"), { label: "Round 4", instruction: "24 SC" });
  assert.deepEqual(splitLabel("Row 2 - 12 DC"), { label: "Row 2", instruction: "12 DC" });
  assert.deepEqual(splitLabel("1 6 SC in MR 6"), { label: "Round 1", instruction: "6 SC in MR 6" });
  assert.equal(splitLabel("6 SC").label, null);
  assert.equal(splitLabel("24 SC").label, null);
});

test("a full pattern is split into rounds with their own counts", () => {
  const pattern = parsePattern(["Round 1: 6 SC in MR", "Round 2: (1 SC, INC) × 6", "Round 3: 18 SC"].join("\n"));
  assert.equal(pattern.rounds.length, 3);
  assert.deepEqual(pattern.rounds.map((round) => round.outputCount), [6, 18, 18]);
  assert.deepEqual(pattern.rounds.map((round) => round.label), ["Round 1", "Round 2", "Round 3"]);
});

const PATTERN_15_ROUNDS = `Round 1: 6 SC in MR (6)
Round 2: INC × 6 (12)
Round 3: (1 SC, INC) × 6 (18)
Round 4: (2 SC, INC) × 6 (24)
Round 5: (3 SC, INC) × 6 (30)
Round 6: (4 SC, INC) × 6 (36)
Round 7: (5 SC, INC) × 6 (42)
Round 8: (6 SC, INC) × 6 (48)
Round 9: (7 SC, INC) × 6 (54)
Round 10: (5 SC, INC) × 6, then (6 SC, INC) × 2 (70)
Round 11: (8 SC, INC) × 6 (60)
Round 12: (9 SC, INC) × 6 (66)
Round 13: (10 SC, INC) × 6 (72)
Round 14: (11 SC, INC) × 6 (78)
Round 15: (12 SC, INC) × 6 (84)`;

test("a 15-round pattern reads every round and its total", () => {
  const pattern = parsePattern(PATTERN_15_ROUNDS);
  assert.equal(pattern.rounds.length, 15);
  assert.deepEqual(
    pattern.rounds.map((round) => round.outputCount),
    [6, 12, 18, 24, 30, 36, 42, 48, 54, 58, 60, 66, 72, 78, 84]
  );
  pattern.rounds.forEach((round, index) => {
    assert.equal(round.declaredTotal, [6, 12, 18, 24, 30, 36, 42, 48, 54, 70, 60, 66, 72, 78, 84][index]);
  });
});

test("a total that disagrees with the instruction is flagged, not applied", () => {
  const pattern = parsePattern(PATTERN_15_ROUNDS);
  const round10 = pattern.rounds[9];
  assert.equal(round10.outputCount, 58);
  assert.equal(round10.declaredTotal, 70);
  assert.equal(round10.status, SEVERITY.CHECK);
  assert.match(round10.warning, /70/);
  assert.equal(round10.operations.length, 5 * 6 + 6 + 6 * 2 + 2);
});

test("a repeat after instructions repeats them, and its count is not a total", () => {
  // Requested behaviour: "1 SC, INC repeat 6 times" repeats both instructions.
  const result = parse("6 SC, x 6");
  assert.equal(result.parsed.declaredTotal, null);
  assert.equal(result.operations.length, 36);
  assert.equal(result.outputCount, 36);
});

test("a repeat with nothing before it is still flagged", () => {
  const result = parse("x 6");
  assert.equal(result.operations.length, 0);
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX));
});

test("an enormous repeat is capped instead of expanding without limit", () => {
  const repeated = parse("(1 SC, INC) × 5000");
  assert.equal(repeated.operations.length, 2000);
  assert.equal(repeated.parsed.issues.length, 1);
  assert.match(repeated.parsed.issues[0].message, /1000/);
  assert.equal(parse("2000 SC").operations.length, 1000);
});

test("a table total that disagrees sets the round status to check", () => {
  const pattern = parsePattern("| Round | Instructions | Total stitches |\n| 1 | 6 SC in MR | 5 |");
  assert.equal(pattern.rounds[0].outputCount, 6);
  assert.equal(pattern.rounds[0].declaredTotal, 5);
  assert.equal(pattern.rounds[0].status, SEVERITY.CHECK);
  assert.match(pattern.rounds[0].warning, /5/);
});

test("a pasted table keeps its declared totals", () => {
  const pattern = parsePattern(["| Round | Instructions | Total stitches |", "| 1 | 6 SC in MR | 6 |", "| 2 | (1 SC, INC) × 6 | 18 |"].join("\n"));
  assert.equal(pattern.rounds.length, 2);
  assert.deepEqual(pattern.rounds.map((round) => round.declaredTotal), [6, 18]);
  assert.deepEqual(pattern.rounds.map((round) => round.outputCount), [6, 18]);
});

// --- required structures A-G ------------------------------------------------

test("A: a simple instruction", () => {
  const result = parse("6 SC");
  assert.equal(result.operations.length, 6);
  assert.equal(result.inputCount, 6);
  assert.equal(result.outputCount, 6);
});

test("B: a sequential instruction", () => {
  const result = parse("3 SC, INC, 4 SC");
  assert.deepEqual(result.types, ["SC", "SC", "SC", "INC", "SC", "SC", "SC", "SC"]);
  assert.equal(result.inputCount, 8);
  assert.equal(result.outputCount, 9);
});

test("D: mixed instructions and groups", () => {
  const result = parse("2 SC, INC, (5 SC, INC) × 5, 3 SC");
  assert.equal(result.outputCount, 42);
  assert.equal(result.inputCount, 36);
});

test("E: multiple groups on one line", () => {
  const result = parse("(2 SC, INC) × 3, (3 SC, INC) × 2");
  assert.equal(result.operations.length, 17);
  assert.equal(result.outputCount, 22);
});

test("F: nested groups", () => {
  const result = parse("((1 SC, INC) × 2, 3 SC) × 3");
  assert.equal(result.operations.length, 21);
  assert.equal(result.outputCount, 27);
});

test("G: every repetition notation is equivalent", () => {
  const forms = [
    "(1 SC, INC) x 6",
    "(1 SC, INC) × 6",
    "(1 SC, INC) X6",
    "[1 SC, INC] 6 times",
    "*1 SC, INC* rep 6",
    "*1 SC, INC*, repeat 6 times",
    "1 SC, INC repeat 6 times"
  ];
  for (const form of forms) {
    const result = parse(form);
    assert.equal(result.operations.length, 12, `${form} should expand to 12 operations`);
    assert.equal(result.outputCount, 18, `${form} should produce 18 stitches`);
    assert.deepEqual(result.parsed.issues.filter((issue) => issue.severity === SEVERITY.FIX), [], `${form} should not need a fix`);
  }
});

// --- the amigurumi pattern from the audit -----------------------------------

test("a plain amigurumi pattern reads all eight rounds", () => {
  const pattern = parsePattern([
    "R1: 6 sc in MR (6)",
    "R2: 2 sc in next st around (12)",
    "R3: (1 sc, inc) x 6 (18)",
    "R4: (2 sc, inc) x 6 (24)",
    "R5: sc in each st around (24)",
    "R6: (2 sc, dec) x 6 (18)",
    "R7: (1 sc, dec) x 6 (12)",
    "R8: sc2tog x 6 (6)"
  ].join("\n"));

  assert.deepEqual(pattern.rounds.map((round) => round.label),
    ["Round 1", "Round 2", "Round 3", "Round 4", "Round 5", "Round 6", "Round 7", "Round 8"]);
  assert.deepEqual(pattern.rounds.map((round) => round.outputCount), [6, 12, 18, 24, 24, 18, 12, 6]);
  assert.deepEqual(pattern.rounds.map((round) => round.declaredTotal), [6, 12, 18, 24, 24, 18, 12, 6]);
  for (const round of pattern.rounds) {
    assert.ok(["clear", "inferred"].includes(round.status), `${round.label} should be clear or inferred, got ${round.status}`);
    assert.equal(round.warning, "", `${round.label} should not warn`);
  }
  assert.equal(pattern.rounds[1].status, "inferred");
  assert.equal(pattern.rounds[4].status, "inferred");
  assert.match(pattern.rounds[1].inferredMessage, /12/);
});

// --- count after the stitch -------------------------------------------------

test("ch 3, dc in next 2 sts, turn reads three counts without junk", () => {
  const result = parse("ch 3, dc in next 2 sts, turn");
  assert.deepEqual(result.types, ["CH", "CH", "CH", "DC", "DC", "TURN"]);
  assert.equal(result.inputCount, 2);
  assert.equal(result.outputCount, 5);
  assert.equal(result.parsed.declaredTotal, null);
  assert.deepEqual(result.parsed.issues, []);
});

test("a count after the stitch is a count, not a total", () => {
  assert.equal(parse("FLO sc 12").operations.length, 12);
  assert.equal(parse("FLO sc 12").parsed.declaredTotal, null);
  assert.equal(parse("sc 12").operations.length, 12);
  assert.equal(parse("sc 12").parsed.declaredTotal, null);

  const skipped = parse("skip 2");
  assert.deepEqual(skipped.types, ["SKIP", "SKIP"]);
  assert.equal(skipped.inputCount, 2);
  assert.equal(skipped.outputCount, 0);
});

test("a total after a counted stitch is still a total", () => {
  const result = parse("4 SC, INC, (7 SC, INC) × 5, 3 SC 54");
  assert.equal(result.parsed.declaredTotal, 54);
  assert.equal(result.outputCount, 54);
});

// --- alphanumeric stitches --------------------------------------------------

test("sc2tog x 6 is six decreases, not three", () => {
  const result = parse("sc2tog x 6");
  assert.equal(result.operations.length, 6);
  assert.deepEqual(countByType(result.types), { DEC: 6 });
  assert.equal(result.inputCount, 12);
  assert.equal(result.outputCount, 6);
  assert.deepEqual(result.parsed.issues, []);
});

test("three-stitch decreases consume three stitches", () => {
  const result = parse("2 sc3tog");
  assert.deepEqual(result.types, ["DEC3", "DEC3"]);
  assert.equal(result.inputCount, 6);
  assert.equal(result.outputCount, 2);
});

// --- increases written as stitches into one target ---------------------------

test("2 sc in next st is one increase", () => {
  const result = parse("2 sc in next st");
  assert.deepEqual(result.types, ["INC"]);
  assert.equal(result.inputCount, 1);
  assert.equal(result.outputCount, 2);
});

test("3 dc in same st produces three stitches from one", () => {
  const result = parse("3 dc in same st");
  assert.deepEqual(result.types, ["INC"]);
  assert.equal(result.inputCount, 1);
  assert.equal(result.outputCount, 3);
});

test("a plural target stays separate stitches", () => {
  const result = parse("2 sc in next 2 sts");
  assert.deepEqual(countByType(result.types), { SC: 2 });
  assert.equal(result.inputCount, 2);
  assert.equal(result.outputCount, 2);
});

// --- fill-the-round forms ---------------------------------------------------

test("sc in each st inherits the previous round", () => {
  const pattern = parsePattern(["Round 1: 20 sc in MR (20)", "Round 2: sc in each st (20)"].join("\n"));
  assert.equal(pattern.rounds[1].outputCount, 20);
  assert.equal(pattern.rounds[1].operations.length, 20);
  assert.equal(pattern.rounds[1].status, "inferred");
  assert.match(pattern.rounds[1].inferredMessage, /20/);
});

test("fill-the-round without a round before is flagged, not guessed", () => {
  const pattern = parsePattern("Round 1: sc in each st around (10)");
  assert.equal(pattern.rounds[0].status, "fix");
  assert.equal(pattern.rounds[0].outputCount, 1);
  assert.match(pattern.rounds[0].warning, /no round before/i);
});

// --- cross-round chain ------------------------------------------------------

test("a round that does not consume the previous round is flagged with both numbers", () => {
  const pattern = parsePattern([
    "Round 1: (5 SC, INC) × 6, then (8 SC, INC) × 2 (62)",
    "Round 2: (8 SC, INC) × 6 (60)"
  ].join("\n"));
  const next = pattern.rounds[1];
  assert.equal(next.status, SEVERITY.CHECK);
  assert.match(next.warning, /54/);
  assert.match(next.warning, /62/);
});

test("a chained pattern raises no chain checks", () => {
  const pattern = parsePattern(["Round 1: 6 SC in MR (6)", "Round 2: INC × 6 (12)", "Round 3: (1 SC, INC) × 6 (18)"].join("\n"));
  for (const round of pattern.rounds) assert.notEqual(round.status, SEVERITY.CHECK);
});

// --- ambiguity: flag, never guess -------------------------------------------

test("instructions written after a repeat are flagged", () => {
  const result = parse("1 SC, INC repeat 6 times, 3 SC");
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX && /repeat/i.test(issue.message)));
});

test("nested brackets are not mixed brackets", () => {
  const result = parse("((9 SC, INC) × 4, (10 SC, INC) × 2) (68)");
  assert.deepEqual(result.parsed.issues, []);
  assert.equal(result.parsed.declaredTotal, 68);
  assert.equal(result.outputCount, 68);
  assert.equal(result.inputCount, 62);
});

test("mixed bracket types are flagged", () => {
  const result = parse("(1 SC, INC]");
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX && /bracket/i.test(issue.message)));
});

test("a zero repeat count is flagged", () => {
  const result = parse("(1 SC, INC) x 0");
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX && /at least 1/.test(issue.message)));
});

test("a non-numeric repeat count is flagged", () => {
  const result = parse("(1 SC, INC) x");
  assert.ok(result.parsed.issues.some((issue) => issue.severity === SEVERITY.FIX));
});

// --- summary rows and labels ------------------------------------------------

test("a Total row sets the total of the round above it", () => {
  const pattern = parsePattern(["Round 1: 6 SC in MR (6)", "Total: 6"].join("\n"));
  assert.equal(pattern.rounds.length, 1);
  assert.equal(pattern.rounds[0].label, "Round 1");
  assert.equal(pattern.rounds[0].declaredTotal, 6);
  assert.equal(pattern.rounds[0].status, "clear");
});

test("a Total row that disagrees is flagged", () => {
  const pattern = parsePattern(["Round 1: 6 SC in MR (6)", "Total: 10"].join("\n"));
  assert.equal(pattern.rounds.length, 1);
  assert.equal(pattern.rounds[0].declaredTotal, 10);
  assert.equal(pattern.rounds[0].status, SEVERITY.CHECK);
  assert.match(pattern.rounds[0].warning, /10/);
});

test("parseLine strips a round label instead of counting it", () => {
  assert.equal(parse("Round 3: 6 SC").operations.length, 6);
  assert.equal(parse("R3. 6 SC").operations.length, 6);
  assert.deepEqual(parse("Round 3: 6 SC").parsed.issues, []);
});

test("a markdown table reports a mismatched total in the warnings", () => {
  const pattern = parsePattern(["| Round | Instructions | Total stitches |", "| 1 | 6 SC in MR | 9 |"].join("\n"));
  assert.equal(pattern.rounds[0].outputCount, 6);
  assert.equal(pattern.warnings.length, 1);
  assert.match(pattern.warnings[0], /9/);
});

// --- performance ------------------------------------------------------------

test("fifteen rounds still parse in about a millisecond", () => {
  const source = Array.from({ length: 15 }, (_, index) => `Round ${index + 1}: (${index} SC, INC) × 6 (${(index + 6) * 6})`).join("\n");
  const started = process.hrtime.bigint();
  const pattern = parsePattern(source);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(pattern.rounds.length, 15);
  assert.ok(ms < 50, `15 rounds took ${ms.toFixed(1)} ms`);
});
