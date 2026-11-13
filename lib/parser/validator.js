import { SEVERITY, worstSeverity } from "./grammar.js";
import { describeWorkings } from "./stitch-calculator.js";

// Turns a parsed line plus its arithmetic into the issues the review panel
// shows, and decides whether the line needs a look before it can be used.

export function validateRound({ items, parsed, calculated, workings }) {
  const issues = [...parsed.issues];
  const { declaredTotal, declaredStyle } = parsed;

  if (!calculated.operations.length) {
    issues.push({
      severity: SEVERITY.FIX,
      message: "Nothing in this line could be read as a crochet instruction."
    });
    return finish(issues, null, writingsOf(items, calculated, workings));
  }

  if (declaredTotal == null) {
    return finish(issues, null, workings);
  }

  if (declaredStyle === "bare") {
    issues.push({
      severity: SEVERITY.NOTE,
      message: `No brackets around ${declaredTotal}, so I read it as the stitch total.`,
      action: "wrap-total"
    });
    if (declaredTotal !== calculated.outputCount) {
      issues.push({
        severity: SEVERITY.CHECK,
        message: `You wrote ${declaredTotal}, but this line adds up to ${calculated.outputCount}.`,
        action: "use-counted",
        worked: workings
      });
    }
    return finish(issues, declaredTotal, workings);
  }

  if (declaredTotal !== calculated.outputCount) {
    issues.push({
      severity: SEVERITY.CHECK,
      message: `You wrote ${declaredTotal}, but this line adds up to ${calculated.outputCount}.`,
      action: "use-counted",
      worked: workings
    });
  }

  return finish(issues, declaredTotal, workings);
}

function finish(issues, declaredTotal, workings) {
  const status = worstSeverity(issues.map((issue) => issue.severity));
  return {
    issues,
    status,
    declaredTotal,
    workings: workings || null,
    blocked: issues.some((issue) => issue.severity === SEVERITY.FIX)
  };
}

function writingsOf(items, calculated, workings) {
  return workings || describeWorkings(items, calculated.outputCount);
}
