// Central stitch registry: one place that defines what each crochet
// operation means in terms of base stitches consumed and stitches produced.
//
// Every entry is data, not behaviour, so new stitches can be added without
// touching the tokenizer, parser or expander.
//
//   input   base stitches the operation works into
//   output  stitches the operation produces
//   aliases words the parser accepts (lowercase, may be several words)

const entry = (type, label, input, output, aliases = []) => ({
  type,
  label,
  input,
  output,
  aliases: [type.toLowerCase().replace(/_/g, " "), ...aliases]
});

export const STITCHES = {
  SC: entry("SC", "Single crochet", 1, 1, ["sc", "single crochet", "single-crochet"]),
  HDC: entry("HDC", "Half double crochet", 1, 1, ["hdc", "half double crochet", "half-double crochet"]),
  DC: entry("DC", "Double crochet", 1, 1, ["dc", "double crochet"]),
  TR: entry("TR", "Treble crochet", 1, 1, ["tr", "treble crochet", "treble", "trc"]),
  SLST: entry("SLST", "Slip stitch", 1, 1, ["slst", "sl st", "slip stitch", "slip-stitch", "ss"]),
  CH: entry("CH", "Chain", 0, 1, ["ch", "chain", "chains"]),
  // "2 SC in the same stitch" is read as an increase by the expander, so it is
  // not listed here: a count always arrives as its own token, never as a word.
  INC: entry("INC", "Increase", 1, 2, ["inc", "increase"]),
  DEC: entry("DEC", "Decrease", 2, 1, ["dec", "decrease", "sc2tog", "hdc2tog", "dc2tog", "tog"]),
  MR: entry("MR", "Magic ring", 0, 0, ["mr", "magic ring", "magic circle"]),
  SKIP: entry("SKIP", "Skip a stitch", 1, 0, ["skip", "sk", "miss"]),
  SHELL: entry("SHELL", "Shell", 1, 1, ["shell", "shell stitch"]),
  PUFF: entry("PUFF", "Puff stitch", 1, 1, ["puff", "puff stitch"]),
  BOBBLE: entry("BOBBLE", "Bobble", 1, 1, ["bobble", "bobble stitch"]),
  CLUSTER: entry("CLUSTER", "Cluster", 1, 1, ["cluster", "cluster stitch", "cl"]),
  PICOT: entry("PICOT", "Picot", 0, 0, ["picot", "picot stitch"]),
  BLOSC: entry("BLOSC", "BLO SC", 1, 1, ["blo sc", "blo-sc", "blosc", "sc in blo", "back loop sc"]),
  FLOSC: entry("FLOSC", "FLO SC", 1, 1, ["flo sc", "flo-sc", "flosc", "sc in flo", "front loop sc"])
};

// Words that describe where a stitch goes rather than what it is.
export const PLACEMENT_WORDS = new Set([
  "in", "into", "on", "the", "a", "of", "next", "same", "first", "last", "previous",
  "stitch", "stitches", "st", "sts", "space", "spaces", "ch", "chain", "chains",
  "mr", "magic", "ring", "circle", "loop", "loops", "back", "front", "blo", "flo",
  "round", "row", "gap", "hole", "chain-space", "into-one"
]);

const ALIAS_INDEX = new Map();
let LONGEST_ALIAS = 1;

for (const definition of Object.values(STITCHES)) {
  for (const alias of definition.aliases) {
    const key = alias.toLowerCase().trim();
    const words = key.split(/\s+/).length;
    ALIAS_INDEX.set(key, definition);
    if (words > LONGEST_ALIAS) LONGEST_ALIAS = words;
  }
}

export const MAX_ALIAS_WORDS = LONGEST_ALIAS;

export function stitchByType(type) {
  return STITCHES[type] || null;
}

export function stitchLabel(type) {
  return STITCHES[type]?.label || type;
}

// Longest-match lookup over consecutive words: "sl st" wins over "st".
export function matchStitch(words, start = 0) {
  const available = words.length - start;
  const limit = Math.min(MAX_ALIAS_WORDS, available);
  for (let length = limit; length >= 1; length -= 1) {
    const key = words.slice(start, start + length).join(" ").toLowerCase();
    const definition = ALIAS_INDEX.get(key);
    if (definition) return { definition, length };
  }
  return null;
}

export function isKnownWord(word) {
  const lower = String(word).toLowerCase();
  if (PLACEMENT_WORDS.has(lower)) return true;
  for (const alias of ALIAS_INDEX.keys()) {
    if (alias.startsWith(`${lower} `) || alias === lower || alias.endsWith(` ${lower}`)) return true;
  }
  return false;
}

// Nearest known word, used for "did you mean INC?" style suggestions.
export function suggestStitch(word) {
  const lower = String(word).toLowerCase();
  let best = null;
  let bestScore = Infinity;
  for (const [alias, definition] of ALIAS_INDEX) {
    const score = editDistance(lower, alias);
    if (score < bestScore) {
      bestScore = score;
      best = { word: alias, definition };
    }
  }
  if (!best) return null;
  const tolerance = Math.max(1, Math.floor(lower.length / 2));
  return bestScore <= tolerance ? best : null;
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}
