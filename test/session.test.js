import test from "node:test";
import assert from "node:assert/strict";

import { cleanCode, cleanName, sameName, SessionError } from "../lib/session.js";

test("a name is trimmed and collapsed but otherwise kept as typed", () => {
  assert.equal(cleanName("  Meghna   R  "), "Meghna R");
  assert.equal(cleanName("Ana"), "Ana");
  assert.throws(() => cleanName("   "), SessionError);
  assert.throws(() => cleanName("x".repeat(41)), /up to 40/);
});

test("a code is folded to something a phone can retype", () => {
  assert.equal(cleanCode("daisy 42"), "DAISY-42");
  assert.equal(cleanCode("  daisy-42  "), "DAISY-42");
  assert.equal(cleanCode("ab12"), "AB12");
});

test("codes that could collide or confuse are rejected", () => {
  assert.throws(() => cleanCode(""), /Enter your code/);
  assert.throws(() => cleanCode("abc"), /at least 4/);
  assert.throws(() => cleanCode("x".repeat(33)), /up to 32/);
  assert.throws(() => cleanCode("daisy_42"), /letters, numbers and dashes/);
  assert.throws(() => cleanCode("daisy!"), /letters, numbers and dashes/);
  assert.throws(() => cleanCode("-daisy"), /cannot start or end with a dash/);
  assert.throws(() => cleanCode("daisy-"), /cannot start or end with a dash/);
});

test("the same code with a differently-cased name is the same person", () => {
  assert.equal(sameName("Meghna", "meghna"), true);
  assert.equal(sameName(" Meghna ", "MEGHNA"), true);
  assert.equal(sameName("Meghna", "Meghana"), false);
  assert.equal(sameName("", ""), true);
});

test("validation errors carry the status the API returns", () => {
  try {
    cleanCode("abc");
    assert.fail("expected a SessionError");
  } catch (error) {
    assert.equal(error.statusCode, 400);
  }
});
