// One registry for stitch names in US and UK crochet terms.
//
// A stitch has an identity (what it is made of, how tall it is). US and UK
// patterns give that same identity different names and different abbreviations,
// and the same abbreviation can mean different stitches in the two systems:
// "DC" is a double crochet in US terms and a double crochet in UK terms — but a
// UK double crochet is a US single crochet. So nothing here is ever a string
// swap: an operation is first resolved to its identity, and the name for that
// identity in the chosen system is what gets displayed.

export const SYSTEMS = ["US", "UK"];
export const DEFAULT_SYSTEM = "US";

// The stitches a beginner's guide covers, in the order they are taught.
export const GUIDE_TYPES = ["CH", "SLST", "SC", "HDC", "DC", "TR", "DTR"];

const entry = (type, us, uk) => ({ type, us, uk });

export const STITCH_TERMS = {
  CH: entry(
    "CH",
    { name: "Chain", abbr: "Ch", aliases: ["ch", "chain", "chains"] },
    { name: "Chain", abbr: "Ch", aliases: ["ch", "chain", "chains"] }
  ),
  SLST: entry(
    "SLST",
    { name: "Slip stitch", abbr: "SlSt", aliases: ["slst", "sl st", "slip stitch", "ss"] },
    { name: "Slip stitch", abbr: "SlSt", aliases: ["slst", "sl st", "slip stitch", "ss"] }
  ),
  SC: entry(
    "SC",
    { name: "Single crochet", abbr: "SC", aliases: ["sc", "single crochet"] },
    { name: "Double crochet", abbr: "DC", aliases: ["dc", "double crochet"] }
  ),
  HDC: entry(
    "HDC",
    { name: "Half double crochet", abbr: "HDC", aliases: ["hdc", "half double crochet"] },
    { name: "Half treble", abbr: "HTr", aliases: ["htr", "half treble"] }
  ),
  DC: entry(
    "DC",
    { name: "Double crochet", abbr: "DC", aliases: ["dc", "double crochet"] },
    { name: "Treble", abbr: "Tr", aliases: ["tr", "treble"] }
  ),
  // US guides write this stitch TC (sometimes TR). UK guides call it a double
  // treble. It is never a single crochet, whatever abbreviation is used.
  TR: entry(
    "TR",
    { name: "Treble crochet", abbr: "TC", aliases: ["tc", "tr", "treble", "treble crochet"] },
    { name: "Double treble", abbr: "DTr", aliases: ["dtr", "double treble"] }
  ),
  DTR: entry(
    "DTR",
    { name: "Double treble crochet", abbr: "DTR", aliases: ["dtr", "double treble crochet"] },
    { name: "Triple treble", abbr: "TTr", aliases: ["ttr", "triple treble"] }
  )
};

// Parser operation types -> stitch identity. The parser reads patterns the way
// US instructions are written, so its TR is the treble, and its loop variants
// are single crochet worked in one loop.
const PARSER_TYPE_IDENTITY = {
  SC: "SC",
  BLOSC: "SC",
  FLOSC: "SC",
  HDC: "HDC",
  DC: "DC",
  TR: "TR",
  DTR: "DTR",
  CH: "CH",
  SLST: "SLST"
};

const NON_STITCH_LABELS = {
  INC: { us: "Increase", uk: "Increase" },
  DEC: { us: "Decrease", uk: "Decrease" },
  DEC3: { us: "3-stitch decrease", uk: "3-stitch decrease" },
  SKIP: { us: "Skip a stitch", uk: "Skip a stitch" },
  JOIN: { us: "Join", uk: "Join" },
  TURN: { us: "Turn", uk: "Turn" },
  MR: { us: "Magic ring", uk: "Magic ring" },
  PICOT: { us: "Picot", uk: "Picot" }
};

export function isSystem(value) {
  return SYSTEMS.includes(String(value || "").toUpperCase());
}

export function normaliseSystem(value, fallback = DEFAULT_SYSTEM) {
  const upper = String(value || "").toUpperCase();
  return SYSTEMS.includes(upper) ? upper : fallback;
}

export function hasTerminology(type) {
  return Boolean(STITCH_TERMS[type]);
}

export function termFor(type, system = DEFAULT_SYSTEM) {
  const entryForType = STITCH_TERMS[type];
  if (!entryForType) return null;
  return entryForType[normaliseSystem(system).toLowerCase()];
}

// "Single crochet (SC)" — the form used in headings and tables.
export function stitchTitle(type, system = DEFAULT_SYSTEM) {
  const term = termFor(type, system);
  return term ? `${term.name} (${term.abbr})` : "";
}

export function stitchName(type, system = DEFAULT_SYSTEM) {
  return termFor(type, system)?.name || "";
}

export function stitchAbbr(type, system = DEFAULT_SYSTEM) {
  return termFor(type, system)?.abbr || "";
}

// The name of the same stitch in the other system, for "in UK terms this is…".
export function otherSystem(system) {
  return normaliseSystem(system) === "US" ? "UK" : "US";
}

const ABBR_INDEX = { US: new Map(), UK: new Map() };
for (const definition of Object.values(STITCH_TERMS)) {
  for (const system of SYSTEMS) {
    const term = definition[system.toLowerCase()];
    for (const alias of [term.abbr, ...term.aliases]) {
      ABBR_INDEX[system].set(alias.toLowerCase(), definition.type);
    }
  }
}

// Read a written abbreviation or name as the stitch it means *in that system*.
// This is the only place "DC" gets interpreted, and the answer depends on the
// system the reader has chosen — never on the letters alone.
export function resolveAbbreviation(text, system = DEFAULT_SYSTEM) {
  const key = String(text || "").trim().toLowerCase().replace(/\.$/, "");
  if (!key) return null;
  const identity = ABBR_INDEX[normaliseSystem(system)].get(key);
  return identity ? { type: identity, ...termFor(identity, system) } : null;
}

export function identityOfParserType(type) {
  return PARSER_TYPE_IDENTITY[type] || null;
}

// Display label for one operation of a parsed round. The operation keeps its
// own type and label; this only decides what the reader sees.
export function operationLabel(operation, system = DEFAULT_SYSTEM) {
  if (!operation) return "";
  const chosen = normaliseSystem(system);
  const identity = PARSER_TYPE_IDENTITY[operation.type];

  if (identity) {
    const term = termFor(identity, chosen);
    if (operation.type === "BLOSC") return `${term.name} in back loop only`;
    if (operation.type === "FLOSC") return `${term.name} in front loop only`;
    return term.name;
  }

  if (operation.type === "MULTI" && Array.isArray(operation.members) && operation.members.length) {
    const names = operation.members.map((member) => {
      const memberIdentity = PARSER_TYPE_IDENTITY[member?.type] || member?.type;
      return termFor(memberIdentity, chosen)?.name || member?.label || member?.type || "stitch";
    });
    return `${names.join(" + ")} in one stitch`;
  }

  const neutral = NON_STITCH_LABELS[operation.type];
  if (neutral) return neutral[chosen.toLowerCase()];
  return operation.label || operation.type || "";
}

// Short form for a card corner: "SC", "DC", "DTr".
export function operationAbbr(operation, system = DEFAULT_SYSTEM) {
  const identity = PARSER_TYPE_IDENTITY[operation?.type];
  if (identity) return stitchAbbr(identity, system);
  return "";
}

// The US/UK table shown at the top of the guide.
export function terminologyTable() {
  return GUIDE_TYPES.map((type) => ({
    type,
    us: STITCH_TERMS[type].us,
    uk: STITCH_TERMS[type].uk
  }));
}

// A project's terminology is only ever what the person chose. Nothing about a
// pattern's text — not "SC", not "DC" — is allowed to decide this for them.
export function confirmedTerminology(project, fallback = null) {
  const stored = String(project?.terms || "").toUpperCase();
  return SYSTEMS.includes(stored) ? stored : fallback;
}
