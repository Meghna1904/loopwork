import test from "node:test";
import assert from "node:assert/strict";
import {
  GUIDE_TYPES,
  STITCH_TERMS,
  SYSTEMS,
  confirmedTerminology,
  normaliseSystem,
  operationAbbr,
  operationLabel,
  otherSystem,
  resolveAbbreviation,
  stitchAbbr,
  stitchName,
  stitchTitle,
  termFor,
  terminologyTable
} from "../lib/terminology.js";
import { STITCH_GUIDE, TECHNIQUES } from "../lib/guide-data.js";

// The mapping the guide is built on. Written out here as data so a change to
// the registry cannot quietly move a stitch to a different name.
const EXPECTED = {
  CH: { us: ["Chain", "Ch"], uk: ["Chain", "Ch"] },
  SLST: { us: ["Slip stitch", "SlSt"], uk: ["Slip stitch", "SlSt"] },
  SC: { us: ["Single crochet", "SC"], uk: ["Double crochet", "DC"] },
  HDC: { us: ["Half double crochet", "HDC"], uk: ["Half treble", "HTr"] },
  DC: { us: ["Double crochet", "DC"], uk: ["Treble", "Tr"] },
  TR: { us: ["Treble crochet", "TC"], uk: ["Double treble", "DTr"] },
  DTR: { us: ["Double treble crochet", "DTR"], uk: ["Triple treble", "TTr"] }
};

test("every US and UK name and abbreviation matches the mapping table", () => {
  for (const [type, row] of Object.entries(EXPECTED)) {
    assert.equal(termFor(type, "US").name, row.us[0], `${type} US name`);
    assert.equal(termFor(type, "US").abbr, row.us[1], `${type} US abbreviation`);
    assert.equal(termFor(type, "UK").name, row.uk[0], `${type} UK name`);
    assert.equal(termFor(type, "UK").abbr, row.uk[1], `${type} UK abbreviation`);
  }
});

test("the guide table lists the same seven stitches in the same order", () => {
  const table = terminologyTable();
  assert.deepEqual(table.map((row) => row.type), GUIDE_TYPES);
  assert.equal(table.length, Object.keys(EXPECTED).length);
  for (const row of table) {
    assert.equal(row.us.name, EXPECTED[row.type].us[0]);
    assert.equal(row.uk.abbr, EXPECTED[row.type].uk[1]);
  }
});

test("names and abbreviations are unique inside each system", () => {
  for (const system of SYSTEMS) {
    const names = GUIDE_TYPES.map((type) => termFor(type, system).name);
    const abbreviations = GUIDE_TYPES.map((type) => termFor(type, system).abbr);
    assert.equal(new Set(names).size, names.length, `${system} names are unique`);
    assert.equal(new Set(abbreviations).size, abbreviations.length, `${system} abbreviations are unique`);
  }
});

test("the same abbreviation means different stitches in the two systems", () => {
  // US DC is a double crochet; UK DC is a US single crochet.
  assert.equal(resolveAbbreviation("DC", "US").type, "DC");
  assert.equal(resolveAbbreviation("DC", "UK").type, "SC");
  assert.notEqual(resolveAbbreviation("DC", "US").type, resolveAbbreviation("DC", "UK").type);

  // US TR/TC is the treble; UK Tr is the US double crochet.
  assert.equal(resolveAbbreviation("TC", "US").type, "TR");
  assert.equal(resolveAbbreviation("Tr", "UK").type, "DC");

  // and the abbreviations that only exist in one system resolve to null.
  assert.equal(resolveAbbreviation("HTr", "US"), null);
  assert.equal(resolveAbbreviation("SC", "UK"), null);
});

test("a treble is never read as a single crochet", () => {
  for (const written of ["TC", "TR", "treble", "treble crochet"]) {
    const resolved = resolveAbbreviation(written, "US");
    assert.equal(resolved?.type, "TR", `${written} stays a treble`);
    assert.notEqual(resolved?.type, "SC");
  }
  assert.equal(stitchName("TR", "US"), "Treble crochet");
  assert.equal(stitchName("TR", "UK"), "Double treble");
});

test("every abbreviation round-trips back to its own identity in its own system", () => {
  for (const type of GUIDE_TYPES) {
    for (const system of SYSTEMS) {
      const term = termFor(type, system);
      assert.equal(resolveAbbreviation(term.abbr, system).type, type, `${term.abbr} in ${system}`);
      assert.equal(resolveAbbreviation(term.abbr.toLowerCase(), system).type, type, `${term.abbr} lowercase in ${system}`);
      assert.equal(resolveAbbreviation(`${term.abbr}.`, system).type, type, `${term.abbr}. with a full stop`);
    }
  }
});

test("the two systems give a different name to the stitches that differ", () => {
  for (const type of GUIDE_TYPES) {
    const us = termFor(type, "US");
    const uk = termFor(type, "UK");
    if (type === "CH" || type === "SLST") {
      assert.equal(us.name, uk.name, `${type} is written the same way in both systems`);
    } else {
      assert.notEqual(us.name, uk.name, `${type} has a different UK name`);
      assert.notEqual(us.abbr, uk.abbr, `${type} has a different UK abbreviation`);
    }
  }
});

test("unknown types and systems fall back without inventing a stitch", () => {
  assert.equal(termFor("NOPE", "US"), null);
  assert.equal(stitchName("NOPE", "US"), "");
  assert.equal(normaliseSystem("nonsense"), "US");
  assert.equal(normaliseSystem("uk"), "UK");
  assert.equal(otherSystem("UK"), "US");
  assert.equal(stitchTitle("SC", "UK"), "Double crochet (DC)");
});

test("operation labels are chosen by stitch identity, not by rewriting text", () => {
  const single = { type: "SC", label: "Single crochet", inputCount: 1, outputCount: 1 };
  assert.equal(operationLabel(single, "US"), "Single crochet");
  assert.equal(operationLabel(single, "UK"), "Double crochet");

  const treble = { type: "TR", label: "Treble crochet", inputCount: 1, outputCount: 1 };
  assert.equal(operationLabel(treble, "UK"), "Double treble");
  assert.equal(operationAbbr(treble, "UK"), "DTr");
  assert.equal(operationAbbr(treble, "US"), "TC");

  const backLoop = { type: "BLOSC", label: "BLO SC", inputCount: 1, outputCount: 1 };
  assert.equal(operationLabel(backLoop, "US"), "Single crochet in back loop only");
  assert.equal(operationLabel(backLoop, "UK"), "Double crochet in back loop only");

  const increase = { type: "INC", label: "Increase", inputCount: 1, outputCount: 2 };
  assert.equal(operationLabel(increase, "UK"), "Increase");

  const sharedBase = { type: "MULTI", label: "(1 HDC, 1 DC) in next ST", members: [{ type: "HDC" }, { type: "DC" }] };
  assert.equal(operationLabel(sharedBase, "US"), "Half double crochet + Double crochet in one stitch");
  assert.equal(operationLabel(sharedBase, "UK"), "Half treble + Treble in one stitch");

  // Text that is not a stitch keeps its own wording.
  const setup = { type: "SETUP", label: "Do not Ch 1", inputCount: 0, outputCount: 0 };
  assert.equal(operationLabel(setup, "US"), "Do not Ch 1");
  assert.equal(operationLabel(setup, "UK"), "Do not Ch 1");
});

test("converting a label does not depend on the words already in it", () => {
  // A single crochet whose stored label was written in UK words is still a
  // single crochet: the identity decides, the text is not searched.
  const mislabelled = { type: "SC", label: "Double crochet", inputCount: 1, outputCount: 1 };
  assert.equal(operationLabel(mislabelled, "US"), "Single crochet");
  assert.equal(operationLabel(mislabelled, "UK"), "Double crochet");

  const trebleLabel = { type: "TR", label: "Single crochet", inputCount: 1, outputCount: 1 };
  assert.equal(operationLabel(trebleLabel, "US"), "Treble crochet");
});

test("terminology is never inferred from a pattern's abbreviations", () => {
  const unknown = { name: "A pattern", originalPattern: "Round 1: 6 SC in MR\nRound 2: 12 DC" };
  assert.equal(confirmedTerminology(unknown), null, "SC and DC alone decide nothing");
  assert.equal(confirmedTerminology(unknown, "US"), "US", "a fallback is only used when one is given");
  assert.equal(confirmedTerminology({ ...unknown, terms: "uk" }), "UK", "an explicit choice is used");
  assert.equal(confirmedTerminology({ ...unknown, terms: "FR" }), null, "an unknown value is not a choice");
});

test("the registry covers every stitch the guide teaches", () => {
  assert.deepEqual(STITCH_GUIDE.map((stitch) => stitch.type), GUIDE_TYPES);
  for (const stitch of STITCH_GUIDE) {
    assert.ok(STITCH_TERMS[stitch.type], `${stitch.type} has US/UK terms`);
    assert.ok(stitch.description.length > 40, `${stitch.type} has a description`);
    assert.ok(stitch.steps.length >= 3, `${stitch.type} has steps`);
    assert.equal(typeof stitch.yarnOvers, "number");
    assert.ok(stitch.loops.length >= 2, `${stitch.type} records loops on the hook`);
    assert.ok(stitch.loops.every((loop) => typeof loop.count === "number" && loop.stage), `${stitch.type} loop stages`);
    assert.equal(stitch.loops[0].count, 1, `${stitch.type} starts with one loop on the hook`);
    assert.equal(stitch.loops.at(-1).count, 1, `${stitch.type} ends with one loop on the hook`);
    assert.ok(stitch.example.us && stitch.example.uk, `${stitch.type} has an example in both systems`);
    assert.ok(stitch.example.us !== stitch.example.uk || stitch.type === "CH" || stitch.type === "SLST");
  }
});

test("the guide keeps no names of its own", () => {
  for (const stitch of STITCH_GUIDE) {
    assert.equal(stitch.name, undefined, `${stitch.type} must not carry a name`);
    assert.equal(stitch.abbr, undefined, `${stitch.type} must not carry an abbreviation`);
  }
});

test("each example line uses its own system's abbreviations", () => {
  const abbreviations = {
    US: ["SC", "HDC", "DC", "TC", "DTR"],
    UK: ["DC", "HTr", "Tr", "DTr", "TTr"]
  };
  const used = (text, system) => abbreviations[system].filter((abbr) => new RegExp(`\\b${abbr}\\b`).test(text));
  const single = STITCH_GUIDE.find((stitch) => stitch.type === "SC");
  assert.deepEqual(used(single.example.us, "US"), ["SC"]);
  assert.deepEqual(used(single.example.uk, "UK"), ["DC"]);
});

test("the techniques section covers the requested techniques", () => {
  const expected = [
    "magic-ring", "increase", "decrease", "invisible-decrease", "blo", "flo",
    "in-the-round", "joining-rounds", "turning-chains", "changing-colour",
    "picot", "granny-clusters", "chain-spaces", "fastening-off"
  ];
  assert.deepEqual(TECHNIQUES.map((technique) => technique.id), expected);
  for (const technique of TECHNIQUES) {
    assert.ok(technique.steps.length >= 3, `${technique.id} has steps`);
    assert.ok(technique.summary.length > 20, `${technique.id} has a summary`);
  }
});
