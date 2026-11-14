// Public surface of the pattern engine.
//
// app.js needs parsePattern, parseRoundDraft and STITCHES. Everything else is
// exported for the pattern layer and the tests: parseLine and splitLabel are
// used by pattern.js and the tests, the calculator and validator are exported
// so a round can be inspected without going through parsePattern.
//
// Removed deliberately: deriveSteps, stitchByType, stitchLabel were never used
// by the app or the tests.

export { STITCHES, suggestStitch, COMPOUND_ALIASES } from "./stitch-registry.js";
export { TOKEN, SEVERITY, worstSeverity } from "./grammar.js";
export { tokenize } from "./tokenizer.js";
export { normalizeLine } from "./normalizer.js";
export { parseLine, parseDeclaration, splitLabel } from "./parser.js";
export { expandItems, startsInRing } from "./expander.js";
export { calculateOperations, calculateItems, describeWorkings } from "./stitch-calculator.js";
export { validateRound } from "./validator.js";
export { parsePattern, parseRoundDraft } from "./pattern.js";
export { parseDocument, documentRounds } from "./document.js";
