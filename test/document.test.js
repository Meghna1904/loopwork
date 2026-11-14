import test from "node:test";
import assert from "node:assert/strict";

import { parseDocument, documentRounds } from "../lib/parser/document.js";
import { SEVERITY } from "../lib/parser/grammar.js";

const DOLL = `# LITTLE AMIGURUMI GIRL DOLL

## Materials
- DK cotton or acrylic yarn
- 2.5 mm or 3 mm crochet hook
- Fiberfill stuffing
- 6 mm safety eyes
- Yarn needle
- Scissors

## Abbreviations
- MR: Magic ring
- SC: Single crochet
- INC: Increase (2 SC in the same stitch)
- DEC: Invisible decrease
- SL ST: Slip stitch
- CH: Chain
- BLO: Back loop only
- FO: Fasten off

Work in continuous rounds unless stated otherwise.

---

# PART 1: HEAD

Use skin-tone yarn.

Round 1: 6 SC in MR (6)

Round 2: INC × 6 (12)

Round 3: (1 SC, INC) × 6 (18)

Round 4: (2 SC, INC) × 6 (24)

Round 5: (3 SC, INC) × 6 (30)

Round 6: (4 SC, INC) × 6 (36)

Rounds 7–12: 36 SC (36)

Round 13: (4 SC, DEC) × 6 (30)

Round 14: (3 SC, DEC) × 6 (24)

Round 15: (2 SC, DEC) × 6 (18)

Insert safety eyes between Rounds 9 and 10, approximately 6 stitches apart. Embroider the nose and mouth.

Round 16: (1 SC, DEC) × 6 (12)

Stuff the head firmly.

Round 17: DEC × 6 (6)

FO and close the opening.

---

# PART 2: BODY

Use dress-colored yarn.

Round 1: 6 SC in MR (6)

Round 2: INC × 6 (12)

Round 3: (1 SC, INC) × 6 (18)

Round 4: (2 SC, INC) × 6 (24)

Rounds 5–8: 24 SC (24)

Round 9: (2 SC, DEC) × 6 (18)

Rounds 10–12: 18 SC (18)

Round 13: (1 SC, DEC) × 6 (12)

Round 14: 12 SC (12)

Stuff the body.

FO, leaving a long tail for sewing the head.

---

# PART 3: ARMS (MAKE 2)

Use skin-tone yarn.

Round 1: 6 SC in MR (6)

Round 2: (1 SC, INC) × 3 (9)

Rounds 3–10: 9 SC (9)

Round 11: (1 SC, DEC) × 3 (6)

Stuff the lower part lightly. Flatten the opening.

FO, leaving a long sewing tail.

---

# PART 4: LEGS (MAKE 2)

Use shoe-colored yarn.

Round 1: 6 SC in MR (6)

Round 2: INC × 6 (12)

Rounds 3–5: 12 SC (12)

Round 6: (2 SC, DEC) × 3 (9)

Rounds 7–10: 9 SC (9)

Stuff firmly.

FO, leaving a long sewing tail.

---

# PART 5: EARS (MAKE 2)

Use skin-tone yarn.

Round 1: 5 SC in MR (5)

SL ST into the first stitch.

FO, leaving a sewing tail.

---

# PART 6: HAIR CAP

Use brown yarn.

Round 1: 6 SC in MR (6)

Round 2: INC × 6 (12)

Round 3: (1 SC, INC) × 6 (18)

Round 4: (2 SC, INC) × 6 (24)

Round 5: (3 SC, INC) × 6 (30)

Round 6: (4 SC, INC) × 6 (36)

Rounds 7–10: 36 SC (36)

FO, leaving a long sewing tail.

Attach the hair cap to the head. Add individual strands of yarn for longer hair if desired.

---

# PART 7: ASSEMBLY

1. Sew the head to the top of the body.
2. Attach both arms to the sides of the body.
3. Sew both legs to the bottom of the body.
4. Attach ears to the sides of the head.
5. Sew the hair cap onto the head.
6. Embroider facial details.
7. Add a small bow or decorative details to the hair.

Your little crochet doll is complete!`;

function roundOf(part, number) {
  return part.rounds.find((round) => round.number === number);
}

test("the full doll document is split into its six parts", () => {
  const document = parseDocument(DOLL);
  assert.equal(document.title, "LITTLE AMIGURUMI GIRL DOLL");
  assert.deepEqual(
    document.parts.map((part) => [part.name, part.quantity, part.rounds.length]),
    [
      ["Head", 1, 17],
      ["Body", 1, 14],
      ["Arms", 2, 11],
      ["Legs", 2, 10],
      ["Ears", 2, 1],
      ["Hair Cap", 1, 10]
    ]
  );
  assert.equal(documentRounds(document).length, 63);
});

test("every round of the doll is clear and every declared total is right", () => {
  const document = parseDocument(DOLL);
  for (const round of documentRounds(document)) {
    assert.equal(round.status, SEVERITY.CLEAR, `${round.label}: ${round.warning}`);
    assert.equal(round.warning, "", round.label);
    assert.equal(round.outputCount, round.declaredTotal, round.label);
  }
  assert.deepEqual(document.warnings, []);
});

test("materials, abbreviations and assembly steps never become rounds or errors", () => {
  const document = parseDocument(DOLL);
  assert.equal(document.abbreviations.MR, "Magic ring");
  assert.equal(document.abbreviations.FO, "Fasten off");
  assert.equal(document.abbreviations.BLO, "Back loop only");
  assert.equal(document.steps.length, 7);
  assert.match(document.steps[0], /Sew the head/);
  // 2.5 mm, 3 mm and 6 mm appear only in materials, so no count was made of them.
  assert.ok(!documentRounds(document).some((round) => /mm/.test(round.instruction)));
});

test("notes attach to the round they follow", () => {
  const document = parseDocument(DOLL);
  const head = document.parts[0];
  const eyes = roundOf(head, 15);
  assert.ok(eyes.notes.some((note) => /safety eyes/.test(note.text)));
  assert.match(eyes.notes.find((note) => /safety eyes/.test(note.text)).hint, /Round 9 and 10/);
  assert.ok(roundOf(head, 16).notes.some((note) => /Stuff the head/.test(note.text)));
  assert.ok(roundOf(head, 17).notes.some((note) => /FO and close/.test(note.text)));

  const ears = document.parts.find((part) => part.name === "Ears");
  assert.ok(roundOf(ears, 1).notes.some((note) => /SL ST into the first stitch/.test(note.text)));
  assert.ok(roundOf(ears, 1).notes.some((note) => /FO, leaving a sewing tail/.test(note.text)));
});

test("a note about earlier rounds is informational, not an error", () => {
  const document = parseDocument(DOLL);
  assert.equal(document.informational.length, 1);
  assert.match(document.informational[0].hint, /Round 9 and 10/);
  for (const round of documentRounds(document)) assert.notEqual(round.status, SEVERITY.FIX);
});

test("round ranges expand into one round each", () => {
  const document = parseDocument(DOLL);
  const head = document.parts[0];
  for (let number = 7; number <= 12; number += 1) {
    const round = roundOf(head, number);
    assert.equal(round.outputCount, 36, `Round ${number}`);
    assert.equal(round.inputCount, 36, `Round ${number}`);
  }
});

test("a magic-ring round starts a piece with no input", () => {
  const document = parseDocument(DOLL);
  for (const part of document.parts) {
    assert.equal(part.rounds[0].inputCount, 0, part.name);
    assert.equal(part.rounds[0].worksIntoRing, true, part.name);
  }
});

test("a single wrong total flags that round only", () => {
  const broken = DOLL.replace("Round 5: (3 SC, INC) × 6 (30)", "Round 5: (3 SC, INC) × 6 (31)");
  const document = parseDocument(broken);
  const head = document.parts[0];
  assert.equal(roundOf(head, 5).status, SEVERITY.CHECK);
  assert.match(roundOf(head, 5).warning, /31/);
  assert.equal(roundOf(head, 5).outputCount, 30);
  // The next round still consumes what round 5 actually produces, so no cascade.
  assert.equal(roundOf(head, 6).status, SEVERITY.CLEAR);
  assert.equal(roundOf(head, 6).warning, "");
});

test("a reversed range is rejected with a warning", () => {
  const document = parseDocument("# PART 1: TEST\nRounds 5–3: 10 SC (10)");
  assert.equal(documentRounds(document).length, 0);
  assert.equal(document.warnings.length, 1);
  assert.match(document.warnings[0], /ends before it starts/);
});

test("a plain round list still reads as rounds", () => {
  const document = parseDocument("Round 1: 6 SC in MR (6)\nRound 2: INC × 6 (12)");
  assert.equal(document.plain, true);
  assert.equal(document.parts.length, 1);
  assert.deepEqual(document.parts[0].rounds.map((round) => round.outputCount), [6, 12]);
});
