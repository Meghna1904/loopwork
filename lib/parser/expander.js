import { STITCHES } from "./stitch-registry.js";

// Turn the parsed AST into a flat, ordered list of operations. Repetition
// copies the whole group in order, `count` times, never dropping or
// reordering a member, and records which repeat iteration produced it.

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
        walk(item.body, groupInfo, depth + 1);
        continue;
      }
      if (item.type === "stitch") emit(item, groupInfo);
    }
  };

  const emit = (item, groupInfo) => {
    const definition = STITCHES[item.stitch];
    if (!definition) return;
    const count = Math.max(1, Math.trunc(item.count || 1));
    const sameTarget = Boolean(item.placement && /same\s+(?:stitch|space)/i.test(item.placement));

    // Several stitches worked into one base stitch is an increase, no matter
    // how it is written.
    if (sameTarget && count > 1 && ["SC", "HDC", "DC", "TR"].includes(definition.type)) {
      operations.push({
        type: "INC",
        label: `${count} ${definition.type} in one stitch`,
        inputCount: 1,
        outputCount: count,
        placement: item.placement,
        repeat: groupInfo,
        depth: groupInfo?.depth ?? 0
      });
      return;
    }

    for (let index = 0; index < count; index += 1) {
      operations.push({
        type: definition.type,
        label: definition.type === "BLOSC" ? "BLO SC" : definition.type === "FLOSC" ? "FLO SC" : definition.type,
        inputCount: definition.input,
        outputCount: definition.output,
        placement: item.placement,
        repeat: groupInfo,
        depth: groupInfo?.depth ?? 0
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

// Group consecutive identical operations, used by the step-by-step display.
export function deriveSteps(operations) {
  const steps = [];
  let cursor = null;
  for (const operation of operations) {
    const key = `${operation.type}|${operation.placement ?? ""}`;
    if (cursor && cursor.key === key) {
      cursor.operations.push(operation);
      continue;
    }
    cursor = { key, type: operation.type, placement: operation.placement ?? null, operations: [operation] };
    steps.push(cursor);
  }
  return steps.map((step, index) => ({ ...step, index }));
}
