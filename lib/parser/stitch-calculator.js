import { STITCHES } from "./stitch-registry.js";
import { expandItems } from "./expander.js";

// Assigns base-stitch and output-stitch positions to a flat operation list and
// totals them up. This is the only place that counts stitches.

export function calculateOperations(operations, { outputStart = 1 } = {}) {
  let inputCursor = 1;
  let outputCursor = outputStart;

  const positioned = operations.map((operation) => {
    const positionedOperation = {
      ...operation,
      inputStart: inputCursor,
      inputEnd: inputCursor + operation.inputCount - 1,
      outputStart: outputCursor,
      outputEnd: outputCursor + operation.outputCount - 1
    };
    inputCursor += operation.inputCount;
    outputCursor += operation.outputCount;
    return positionedOperation;
  });

  return {
    operations: positioned,
    inputCount: inputCursor - 1,
    outputCount: outputCursor - outputStart
  };
}

// The working shown beside a "check" issue, e.g. 3 + 2 + (6 + 2) × 5 + 3 = 48
export function describeWorkings(items, total) {
  const part = (list) =>
    list
      // Only stitches that fill the round appear in the working. A join, a
      // chain or a picot is part of the method, so "0 +" would only be noise.
      .filter((item) => item.type === "group" || item.type === "repeat" || (item.type === "stitch" && STITCHES[item.stitch]?.counts !== false))
      .map((item) => {
        if (item.type === "group") return `(${part(item.body)})`;
        if (item.type === "repeat") return `(${part(item.body)}) × ${item.count}`;
        if (item.type === "stitch") {
          const definition = STITCHES[item.stitch];
          if (!definition) return "0";
          return String(definition.output * Math.max(1, Math.trunc(item.count || 1)));
        }
        return "0";
      })
      .join(" + ");

  const expression = part(items);
  if (!expression) return null;
  return `${expression} = ${total}`;
}

export function calculateItems(items, { outputStart = 1 } = {}) {
  const operations = expandItems(items);
  return calculateOperations(operations, { outputStart });
}
