import { STITCHES } from "./stitch-registry.js";

// Turn the parsed AST into a flat, ordered list of operations. Repetition
// copies the whole group in order, `count` times, never dropping or
// reordering a member, and records which repeat iteration produced it.
//
// Every operation carries its own accounting: how many base stitches it works
// into, how many stitches it produces, and whether it counts towards the
// round. Joins, chains, magic rings and picots are part of the instructions but
// never part of the round's stitch total.

const BASE_STITCHES = new Set(["SC", "HDC", "DC", "TR"]);
const PLURAL_TARGET = /\b(?:next|previous|last)\s+\d+\s+(?:sts|stitches|spaces)\b/i;
const SINGLE_TARGET = /\b(?:next|same|each|every|this)\b/i;

export function expandItems(items) {
  const operations = [];
  let groups = 0;

  const walk = (list, groupInfo, depth) => {
    for (const item of list) {
      if (item.type === "repeat") {
        groups += 1;
        const id = `group-${groups}`;
        for (let index = 0; index < item.count; index += 1) {
          walk(item.body, { id, index, total: item.count, depth }, depth + 1);
        }
        continue;
      }
      if (item.type === "group") {
        // Several stitches worked together into one base stitch keep their
        // order and their shared base: they are one operation, not a flattening.
        if (item.intoOne) emitSharedGroup(item, groupInfo, depth);
        else walk(item.body, groupInfo, depth + 1);
        continue;
      }
      if (item.type === "stitch") emit(item, groupInfo, depth);
    }
  };

  const membersOf = (list) => {
    const members = [];
    const collect = (body) => {
      for (const item of body) {
        if (!item) continue;
        if (item.type === "group") { collect(item.body); continue; }
        if (item.type === "repeat") { for (let index = 0; index < item.count; index += 1) collect(item.body); continue; }
        if (item.type !== "stitch") continue;
        const definition = STITCHES[item.stitch];
        if (!definition) continue;
        const count = Math.max(1, Math.trunc(item.count || 1));
        for (let index = 0; index < count; index += 1) {
          members.push({ type: definition.type, label: definition.label, outputCount: definition.output });
        }
      }
    };
    collect(list);
    return members;
  };

  const emitSharedGroup = (item, groupInfo, depth) => {
    const members = membersOf(item.body);
    if (!members.length) return;
    operations.push({
      type: "MULTI",
      label: `${members.map((member) => member.type).join(" + ")} in one stitch`,
      inputCount: 1,
      outputCount: members.reduce((sum, member) => sum + member.outputCount, 0),
      counts: true,
      members,
      placement: item.placement ?? null,
      repeat: groupInfo,
      depth
    });
  };

  const emit = (item, groupInfo, depth) => {
    const definition = STITCHES[item.stitch];
    if (!definition) return;

    // A decoration such as a picot hangs off the stitch before it: it consumes
    // nothing and produces nothing, whatever its chains say.
    if (definition.decorative) {
      operations.push({
        type: definition.type,
        label: item.detail ? `${definition.label} (${item.detail})` : definition.label,
        inputCount: 0,
        outputCount: 0,
        counts: false,
        decorative: true,
        detail: item.detail ?? null,
        placement: item.placement ?? null,
        repeat: groupInfo,
        depth
      });
      return;
    }

    const count = Math.max(1, Math.trunc(item.count || 1));
    const placement = item.placement || "";
    const worksIntoOne =
      SINGLE_TARGET.test(placement) &&
      !PLURAL_TARGET.test(placement) &&
      BASE_STITCHES.has(definition.type);

    // Several stitches worked into one base stitch is an increase, however it
    // is written: "2 SC in next st", "3 dc in same st", "2 sc in each st".
    if (worksIntoOne && count > 1) {
      operations.push({
        type: "INC",
        label: `${count} ${definition.type} in one stitch`,
        inputCount: 1,
        outputCount: count,
        counts: true,
        placement: item.placement,
        repeat: groupInfo,
        depth
      });
      return;
    }

    for (let index = 0; index < count; index += 1) {
      operations.push({
        type: definition.type,
        label: item.label || definition.type,
        inputCount: definition.input,
        outputCount: definition.output,
        counts: definition.counts,
        placement: item.placement ?? null,
        repeat: groupInfo,
        depth
      });
    }
  };

  walk(items, null, 0);
  return operations;
}

// "6 SC in MR" works into a ring: real crochet input is zero, even though the
// operations still each consume one base stitch within the round.
export function startsInRing(items) {
  for (const item of items) {
    if (item.type === "group") {
      if (startsInRing(item.body)) return true;
      continue;
    }
    if (item.type === "repeat") return startsInRing(item.body);
    if (item.type === "stitch") {
      return Boolean(item.placement && /(?:magic|ring|mr\b|circle)/i.test(item.placement));
    }
  }
  return false;
}
