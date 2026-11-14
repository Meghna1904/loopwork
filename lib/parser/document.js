import { parsePattern, parseRoundDraft } from "./pattern.js";

// Reading a pasted pattern document.
//
// A real pattern is not a list of rounds: it has a title, materials, an
// abbreviation key, several parts, prose notes and assembly steps. This stage
// classifies every line first, and only round lines reach the round parser.
// Notes never become errors, and numbers in prose (6 mm, "Rounds 9 and 10")
// are never read as counts.

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^[-=_*]{3,}$/;
const PART = /^part\s+(\d+)\s*[:.\-–—]?\s*(.*)$/i;
const RANGE = /^(?:rounds?|rnds?|rows?|r)\s*#?\s*(\d+)\s*(?:[–—−-]|to)\s*(\d+)\s*[:.\-–—]?\s*(.*)$/i;
const ROUND = /^(?:rounds?|rnds?|rows?|r)\s*#?\s*(\d+)\s*[:.\-–—]?\s*(.*)$/i;
const QUANTITY = /\(\s*make\s+(\d+)\s*\)/i;
const ABBREVIATION = /^([A-Za-z][A-Za-z0-9 ]{0,9}?)\s*[:=]\s+(.+)$/;
const STEP = /^(\d+)[.)]\s+(.+)$/;
const BULLET = /^[-*+•]\s+(.+)$/;

const MAX_RANGE = 200;

function stripInline(text) {
  return String(text ?? "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\\([#*_])/g, "$1")
    .trim();
}

function titleCase(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (match, space, letter) => space + letter.toUpperCase());
}

function referencesRounds(text) {
  const refs = [];
  const regex = /\brounds?\s+(\d+)(?:\s*(?:and|to|[–—−-])\s*(\d+))?/gi;
  let match = regex.exec(text);
  while (match) {
    refs.push(Number(match[1]));
    if (match[2]) refs.push(Number(match[2]));
    match = regex.exec(text);
  }
  return refs;
}

// Plain round lists keep the old path: no headings means no document structure.
export function parseDocument(source) {
  const raw = String(source ?? "");
  const lines = raw.split(/\r?\n/);
  const hasStructure =
    lines.some((line) => HEADING.test(line.trim())) ||
    lines.some((line) => PART.test(stripInline(line)));

  if (!hasStructure) {
    const plain = parsePattern(raw);
    return {
      title: "",
      parts: [{ name: null, quantity: 1, rounds: plain.rounds, notes: [] }],
      abbreviations: {},
      steps: [],
      notes: [],
      informational: [],
      warnings: plain.warnings,
      plain: true
    };
  }

  const document = {
    title: "",
    parts: [],
    abbreviations: {},
    steps: [],
    notes: [],
    informational: [],
    warnings: [],
    plain: false
  };

  let part = null;
  let section = "instructions";
  let lastRound = null;

  const startPart = (name, quantity) => {
    part = { name, quantity, rounds: [], notes: [] };
    document.parts.push(part);
    lastRound = null;
    section = "instructions";
  };

  const labelFor = (number) => (part?.name ? `${part.name} · Round ${number}` : `Round ${number}`);

  const addRound = (number, instruction) => {
    if (!part) startPart(null, 1);
    const previous = lastRound;
    const draft = parseRoundDraft(labelFor(number), instruction, {
      previousOutput: previous ? previous.outputCount : null,
      previousLabel: previous ? previous.label : null
    });
    draft.notes = [];
    draft.number = number;
    draft.part = part.name || null;
    draft.partQuantity = part.quantity;
    part.rounds.push(draft);
    lastRound = draft;
  };

  const addNote = (text) => {
    const clean = stripInline(text);
    if (!clean) return;
    if (!part) {
      document.notes.push({ text: clean });
      return;
    }
    const note = { text: clean };
    const refs = referencesRounds(clean);
    if (refs.length && lastRound && Math.max(...refs) < lastRound.number) {
      note.hint = `Refers to Round ${refs.join(" and ")} but appears after Round ${lastRound.number}.`;
      document.informational.push({ part: part.name, text: clean, hint: note.hint });
    }
    if (lastRound) lastRound.notes.push(note);
    else part.notes.push(note);
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00a0/g, " ").trim();
    if (!line) continue;
    if (RULE.test(line)) continue;

    const heading = line.match(HEADING);
    if (heading) {
      const text = stripInline(heading[2]);
      const partMatch = text.match(PART);
      if (partMatch) {
        const rest = partMatch[2].trim();
        if (/^(assembly|finishing)\b/i.test(rest)) {
          section = "assembly";
          continue;
        }
        const quantity = rest.match(QUANTITY);
        const name = titleCase(stripInline(rest.replace(QUANTITY, "")));
        startPart(name || `Part ${partMatch[1]}`, quantity ? Number(quantity[1]) : 1);
        continue;
      }
      if (/^materials?\b/i.test(text)) {
        section = "materials";
        continue;
      }
      if (/^abbreviations?\b/i.test(text)) {
        section = "abbreviations";
        continue;
      }
      if (/^(assembly|finishing)\b/i.test(text)) {
        section = "assembly";
        continue;
      }
      if (!document.title && heading[1].length === 1) {
        document.title = text;
        continue;
      }
      // Any other heading is context, not an instruction.
      continue;
    }

    if (section === "materials") continue;

    if (section === "abbreviations") {
      // The key is usually a bullet: "- MR: Magic ring".
      const entry = stripInline(line.replace(BULLET, "$1")).match(ABBREVIATION);
      if (entry) document.abbreviations[entry[1].trim().toUpperCase()] = entry[2].trim();
      // Anything else in that section is general prose, not an instruction.
      else document.notes.push({ text: stripInline(line) });
      continue;
    }

    if (section === "assembly") {
      const step = stripInline(line).match(STEP);
      if (step) document.steps.push(stripInline(step[2]));
      else document.notes.push({ text: stripInline(line) });
      continue;
    }

    const range = stripInline(line).match(RANGE);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const instruction = range[3].trim();
      if (!instruction) {
        document.warnings.push(`Rounds ${start}–${end} has no instruction, so I left it out.`);
        continue;
      }
      if (end < start) {
        document.warnings.push(`Rounds ${start}–${end} ends before it starts, so I left it out.`);
        continue;
      }
      if (end - start > MAX_RANGE) {
        document.warnings.push(`Rounds ${start}–${end} is more than ${MAX_RANGE} rounds, so I left it out.`);
        continue;
      }
      for (let number = start; number <= end; number += 1) addRound(number, instruction);
      continue;
    }

    const round = stripInline(line).match(ROUND);
    if (round && round[2].trim()) {
      addRound(Number(round[1]), round[2].trim());
      continue;
    }

    // A numbered list outside the assembly section is still a step, never a round.
    const step = stripInline(line).match(STEP);
    if (step) {
      document.steps.push(stripInline(step[2]));
      continue;
    }

    const bullet = stripInline(line).match(BULLET);
    if (bullet) {
      document.notes.push({ text: stripInline(bullet[1]) });
      continue;
    }

    addNote(line);
  }

  if (!document.parts.length) {
    const plain = parsePattern(raw);
    document.parts.push({ name: null, quantity: 1, rounds: plain.rounds, notes: [] });
    document.warnings.push(...plain.warnings);
  }

  return document;
}

export function documentRounds(document) {
  return (document?.parts || []).flatMap((part) => part.rounds || []);
}
