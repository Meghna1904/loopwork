import test from "node:test";
import assert from "node:assert/strict";

import { parseRoundDraft, parsePattern } from "../lib/parser/index.js";
import { SEVERITY } from "../lib/parser/grammar.js";

// The star trinket tray: joins, chains, treble crochet, pairs worked into one
// base stitch, and a picot. These are the counts a crocheter would get by hand.
const ROUNDS = [
  { text: "10 HDC in MR (10)", input: 0, output: 10 },
  { text: "SlSt to join, Ch 1, (2 HDC in next ST) × 10 (20)", input: 10, output: 20 },
  { text: "SlSt to join, Ch 1, (1 HDC, (1 DC, 1 TC) in next ST, 1 TC, (1 DC, 1 HDC) in next ST) × 5 (30)", input: 20, output: 30 },
  { text: "(SlSt in next ST, (1 HDC, 1 DC) in next ST, 1 TC in next ST, Picot (Ch 3, SlSt in first Ch), 1 TC in next ST, (1 DC, 1 HDC) in next ST, SlSt in next ST) × 5 (40)", input: 30, output: 40 },
  { text: "SlSt to join, Ch 1, SC in BLO around (40)", input: 40, output: 40 },
  { text: "SlSt to join, Ch 1, SC around (40)", input: 40, output: 40 },
  { text: "SlSt to join, Ch 1, SC around (40)", input: 40, output: 40 }
];

function parseRounds() {
  const drafts = [];
  let previous = null;
  ROUNDS.forEach((round, index) => {
    const draft = parseRoundDraft(`Round ${index + 1}`, round.text, {
      previousOutput: previous?.outputCount ?? null,
      previousLabel: previous?.label ?? null
    });
    drafts.push(draft);
    previous = draft;
  });
  return drafts;
}

test("the star trinket tray counts every round the way the pattern declares", () => {
  const drafts = parseRounds();
  drafts.forEach((draft, index) => {
    const expected = ROUNDS[index];
    assert.equal(draft.inputCount, expected.input, `Round ${index + 1} input`);
    assert.equal(draft.outputCount, expected.output, `Round ${index + 1} output`);
    assert.equal(draft.declaredTotal, expected.output, `Round ${index + 1} declared`);
  });
});

test("no round of the star trinket tray is flagged", () => {
  for (const draft of parseRounds()) {
    assert.equal(draft.warning, "", `${draft.label}: ${draft.warning}`);
    assert.ok(![SEVERITY.FIX, SEVERITY.CHECK].includes(draft.status), `${draft.label} is ${draft.status}`);
  }
});

test("joins and chains set the round up without counting as stitches", () => {
  const [round2] = parseRounds().slice(1);
  const [join, chain] = round2.operations;
  assert.equal(join.type, "JOIN");
  assert.equal(join.counts, false);
  assert.equal(join.inputCount, 0);
  assert.equal(chain.type, "CH");
  assert.equal(chain.counts, false);
  assert.equal(chain.outputCount, 0);
  // The ten increases are the only stitches in the count.
  assert.equal(round2.operations.filter((operation) => operation.counts).length, 10);
});

test("TC is treble crochet, never a single crochet", () => {
  const [, , round3] = parseRounds();
  const types = new Set(round3.operations.map((operation) => operation.type));
  assert.ok(types.has("TR"), "TC becomes a treble crochet operation");
  assert.ok(!round3.operations.some((operation) => operation.label === "SC" && /TC/i.test(operation.placement || "")));
});

test("a pair worked into one base stitch stays one operation", () => {
  const [, , round3] = parseRounds();
  const firstRepeat = round3.operations.slice(2, 8).map((operation) => operation.type);
  // 1 HDC, then (DC + TC) into one stitch, then 1 TC, then (DC + HDC) into one.
  assert.deepEqual(firstRepeat, ["HDC", "MULTI", "TR", "MULTI", "HDC", "MULTI"]);
  const pair = round3.operations.find((operation) => operation.type === "MULTI");
  assert.equal(pair.inputCount, 1);
  assert.equal(pair.outputCount, 2);
  assert.deepEqual(pair.members.map((member) => member.type), ["DC", "TR"]);
});

test("order inside a repeated round is preserved", () => {
  const [,,, round4] = parseRounds();
  const first = round4.operations.slice(0, 7).map((operation) => operation.type);
  assert.deepEqual(first, ["SLST", "MULTI", "TR", "PICOT", "TR", "MULTI", "SLST"]);
  // Five identical repeats, each starting with a slip stitch.
  assert.equal(round4.operations.length, 35);
  assert.deepEqual(round4.operations.slice(7, 14).map((operation) => operation.type), first);
});

test("a picot is decoration: no base stitch, no round stitch, whatever its chains", () => {
  const [,,, round4] = parseRounds();
  const picot = round4.operations.find((operation) => operation.type === "PICOT");
  assert.equal(picot.counts, false);
  assert.equal(picot.inputCount, 0);
  assert.equal(picot.outputCount, 0);
  assert.equal(picot.decorative, true);
  assert.match(picot.label, /Ch 3, SlSt in first Ch/);
  // Its chains and slip stitch are not separate operations to tick.
  assert.ok(!round4.operations.some((operation) => operation.type === "CH"));
  assert.equal(round4.operations.filter((operation) => operation.type === "SLST").length, 10);
});

test("a round that fills the one before keeps its setup out of the repeat", () => {
  const drafts = parseRounds();
  const round5 = drafts[4];
  assert.equal(round5.operations.filter((operation) => operation.type === "BLOSC").length, 40);
  assert.equal(round5.operations.filter((operation) => operation.counts).length, 40);
  assert.equal(round5.inputCount, 40);
});

test("the whole document parses as seven rounds with correct totals", () => {
  const document = ROUNDS.map((round, index) => `Round ${index + 1}: ${round.text}`).join("\n");
  const { rounds, warnings } = parsePattern(document);
  assert.equal(rounds.length, 7);
  assert.deepEqual(warnings, []);
  assert.deepEqual(rounds.map((round) => [round.inputCount, round.outputCount]), ROUNDS.map((round) => [round.input, round.output]));
});

// The same grammar, written differently: nothing here is special-cased to the
// star pattern.
test("equivalent wording outside this pattern reads the same way", () => {
  const trayless = parseRoundDraft("Round 3", "slip stitch to join, chain 1, (1 hdc, (1 dc, 1 tr) in next st, 1 tc, (1 dc, 1 hdc) in next st) x 6 (36)", {
    previousOutput: 24,
    previousLabel: "Round 2"
  });
  assert.equal(trayless.inputCount, 24);
  assert.equal(trayless.outputCount, 36);
  assert.equal(trayless.warning, "");
});

test("double crochet and treble crochet together are not merged into one stitch", () => {
  const draft = parseRoundDraft("Round 1", "(1 DC, 1 TC) in next ST × 6 (12)");
  assert.equal(draft.outputCount, 12);
  const multi = draft.operations[0];
  assert.equal(multi.type, "MULTI");
  assert.deepEqual(multi.members.map((member) => member.type), ["DC", "TR"]);
  assert.equal(multi.outputCount, 2);
});
