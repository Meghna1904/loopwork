// Token kinds and the structures the parser accepts. Keeping the grammar in
// one place makes it obvious what notation is supported and what is not.

export const TOKEN = {
  NUMBER: "number",
  WORD: "word",
  LPAREN: "lparen",
  RPAREN: "rparen",
  SEPARATOR: "separator",
  COLON: "colon",
  STAR: "star",
  UNKNOWN: "unknown"
};

export const SEVERITY = {
  CLEAR: "clear",
  NOTE: "note",
  CHECK: "check",
  FIX: "fix"
};

// Lower ranks win when a line carries several issues.
export const SEVERITY_RANK = {
  [SEVERITY.CLEAR]: 0,
  [SEVERITY.NOTE]: 1,
  [SEVERITY.CHECK]: 2,
  [SEVERITY.FIX]: 3
};

export function worstSeverity(severities) {
  return severities.reduce(
    (worst, severity) => (SEVERITY_RANK[severity] > SEVERITY_RANK[worst] ? severity : worst),
    SEVERITY.CLEAR
  );
}

// Supported line shapes (see test/parser.test.js for each one):
//
//   [label] instruction [declared total]
//
//   instruction := item (separator? item)*
//   item        := repeat | stitch-run
//   repeat      := '(' instruction ')' [x] count
//   stitch-run  := [count] stitch [placement]
//   placement   := ('in'|'into'|'on') placement-word...
//   count       := NUMBER
//
//   label       := 'r'|'rnd'|'round'|'row' NUMBER | NUMBER (in a numbered list)
//   declared    := '(' NUMBER ['sts'] ')' | '=' NUMBER | NUMBER (bare, flagged)
export const GRAMMAR = {
  separators: [",", ";"],
  repeatOperators: ["x", "X", "×", "times", "*"],
  placementIntroducers: ["in", "into", "on"],
  labelWords: ["round", "rnd", "row", "r", "runde", "rounds", "rows"]
};

export function isRepeatOperator(word) {
  return GRAMMAR.repeatOperators.includes(String(word));
}
