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
  // A count that came from the round before rather than from this line.
  INFERRED: "inferred",
  NOTE: "note",
  CHECK: "check",
  FIX: "fix"
};

// Higher ranks win when a line carries several issues.
export const SEVERITY_RANK = {
  [SEVERITY.CLEAR]: 0,
  [SEVERITY.INFERRED]: 1,
  [SEVERITY.NOTE]: 2,
  [SEVERITY.CHECK]: 3,
  [SEVERITY.FIX]: 4
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
//   item        := repeat | group | stitch-run
//   repeat      := ('(' instruction ')' | sequence) [x] count
//   stitch-run  := [count] stitch [count] [placement]
//   placement   := ('in'|'into'|'on') placement-word... [count 'sts']
//   count       := NUMBER (a whole number in 1..MAX_COUNT)
//
//   label       := 'r'|'rnd'|'round'|'row' NUMBER | NUMBER (numbered list)
//   declared    := '(' NUMBER ['sts'] ')' | '=' NUMBER | 'Total: NUMBER'
//                  | NUMBER after a complete instruction (bare, flagged)
export const GRAMMAR = {
  separators: [",", ";"],
  // "x 6" repeats the instruction it follows; "repeat 6" repeats everything
  // written before it on the line. They are different on purpose.
  itemRepeatOperators: ["x", "X", "×", "times", "*"],
  wholeRepeatWords: ["repeat", "repeated", "rep"],
  placementIntroducers: ["in", "into", "on"],
  labelWords: ["round", "rnd", "rounds", "rnds", "row", "rows", "r", "runde"]
};

export function isItemRepeatOperator(word) {
  return GRAMMAR.itemRepeatOperators.includes(String(word));
}

export function isWholeRepeatWord(word) {
  return GRAMMAR.wholeRepeatWords.includes(String(word).toLowerCase());
}

export function isRepeatOperator(word) {
  return isItemRepeatOperator(word) || isWholeRepeatWord(word);
}

// "sc in each st around" / "sc around": how many times is decided by the
// round before, not by this line.
export const FILL_WORDS = ["around", "each", "every"];
