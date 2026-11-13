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

test("an orphaned repeat count is not mistaken for the round total", () => {
  const result = parse("6 SC, x 6");
  assert.equal(result.parsed.declaredTotal, null);
  assert.equal(result.operations.length, 6);
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
