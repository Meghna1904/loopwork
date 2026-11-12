const STORAGE_KEY = "loopwork-projects-v1";
const THEME_KEY = "loopwork-theme-v1";
const SAMPLE_PATTERN = `Round 1: 6 SC in MR
Round 2: (1 SC, INC) × 6
Round 3: (2 SC, INC) × 6
Round 4: (3 SC, INC) × 6
Round 5: 30 SC`;

const stitchNames = {
  SC: "Single crochet", HDC: "Half double crochet", DC: "Double crochet", TR: "Treble crochet",
  INC: "Increase", DEC: "Decrease", CH: "Chain", SLST: "Slip stitch", MR: "Magic ring",
  SKIP: "Skip a stitch", SHELL: "Shell", PUFF: "Puff stitch", BOBBLE: "Bobble"
};

function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function makeRound(label, instruction, options = {}) {
  const parsed = parseInstruction(instruction, options.startOutput || 1);
  return {
    id: makeId(), label, title: options.title || label, originalText: instruction,
    operations: parsed.operations, expectedInput: parsed.inputCount,
    expectedOutput: parsed.outputCount, expectedStitches: parsed.declaredCount,
    warning: parsed.warning || "", complete: false
  };
}

function parseColumnarTable(sourceLines) {
  const cells = sourceLines.map((line) => line
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/^\s*\|+|\|+\s*$/g, "")
    .trim())
    .filter((cell) => cell && !/^:?-{1,}:?$/.test(cell));
  const headerIndex = cells.findIndex((cell, index) =>
    /^round$/i.test(cell) && /^instructions?$/i.test(cells[index + 1] || "") && /^total\s+stitches$/i.test(cells[index + 2] || ""));
  if (headerIndex < 0) return null;

  const rounds = [];
  const warnings = [];
  const data = cells.slice(headerIndex + 3);
  for (let index = 0; index + 2 < data.length; index += 3) {
    const roundMatch = data[index].match(/^(?:round\s*)?(\d+)$/i);
    const totalMatch = data[index + 2].match(/^(\d+)$/);
    const instruction = data[index + 1].trim();
    if (!roundMatch || !totalMatch || !instruction) {
      warnings.push(`Couldn’t read table cells near “${data[index]}”. Keep each round, instruction, and total in its own cell.`);
      continue;
    }
    const total = Number(totalMatch[1]);
    const round = makeRound(`Round ${roundMatch[1]}`, instruction);
    round.expectedStitches = total;
    if (round.expectedOutput !== total) round.warning = `Table total is ${total}; the instructions produce ${round.expectedOutput}.`;
    if (round.warning) warnings.push(`${round.label}: ${round.warning}`);
    rounds.push(round);
  }
  if (!rounds.length) warnings.push("No round rows were found after the table header.");
  return { rounds, warnings };
}

function parsePattern(text) {
  const rounds = [];
  const warnings = [];
  const sourceLines = text.split(/\r?\n/);
  const columnar = parseColumnarTable(sourceLines);
  if (columnar) return columnar;
  const lines = sourceLines.map((line) => line.replace(/\u00a0/g, " ").trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /round/i.test(line) && /instructions?/i.test(line) && /total/i.test(line));
  const tableMode = headerIndex >= 0 || lines.some((line) => line.includes("|"));
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
  let fallback = 1;
  for (const line of dataLines) {
    if (/^\|?\s*:?-{2,}/.test(line) || /^\|?[\s|:-]+\|?$/.test(line)) continue;
    let tableCells = null;
    if (tableMode && line.includes("|")) {
      tableCells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter(Boolean);
    }
    if (tableCells?.length >= 3) {
      const roundNumber = tableCells[0].match(/\d+/)?.[0];
      const instruction = tableCells[1];
      const total = Number(tableCells[2].match(/\d+/)?.[0]);
      if (!roundNumber || !instruction || !Number.isFinite(total)) continue;
      const round = makeRound(`Round ${roundNumber}`, instruction);
      round.expectedStitches = total;
      if (round.expectedOutput !== total) round.warning = `Table total is ${total}; the instructions produce ${round.expectedOutput}.`;
      rounds.push(round);
      fallback += 1;
      continue;
    }
    if (tableMode) {
      const row = line.match(/^\|?\s*(?:round\s*)?(\d+)\s+(.+?)\s+(\d+)\s*\|?$/i);
      if (row) {
        const round = makeRound(`Round ${row[1]}`, row[2]);
        round.expectedStitches = Number(row[3]);
        if (round.expectedOutput !== round.expectedStitches) round.warning = `Table total is ${round.expectedStitches}; the instructions produce ${round.expectedOutput}.`;
        rounds.push(round);
        fallback += 1;
        continue;
      }
    }
    const match = line.match(/^(?:(round|rnd|row|r)\s*#?\s*(\d+)|([\w -]{1,24})\s*:)\s*[:.]?\s*(.*)$/i);
    let label;
    let instruction;
    if (match) {
      label = match[1] ? `${/row/i.test(match[1]) ? "Row" : "Round"} ${match[2]}` : (match[3] || `Round ${fallback}`).trim();
      instruction = match[4].trim();
    } else {
      label = `Round ${fallback}`;
      instruction = line;
    }
    const round = makeRound(label, instruction);
    if (round.warning) warnings.push(`${label}: ${round.warning}`);
    rounds.push(round);
    fallback += 1;
  }
  if (!rounds.length) warnings.push("Add at least one round or row of instructions.");
  return { rounds, warnings };
}

function expandRepeats(source) {
  let text = source.replace(/[×✕]/g, "x").replace(/\b(repeat(?:ed)?\s+(\d+)\s+times?)\b/gi, "x$2");
  const stitchToken = "(?:BLO\\s+SC|FLO\\s+SC|SL\\s*ST|SC|HDC|DC|TR|INC|DEC|CH|MR|SKIP|SHELL|PUFF|BOBBLE)";
  text = text.replace(new RegExp(`(${stitchToken})\\s*x\\s*(\\d+)`, "gi"), (_, instruction, count) => Array(Number(count)).fill(instruction).join(", "));
  for (let pass = 0; pass < 12; pass += 1) {
    const before = text;
    text = text.replace(/\(([^()]+)\)\s*x\s*(\d+)/gi, (_, group, count) => Array(Number(count)).fill(group).join(", "));
    text = text.replace(/\*([^*]+)\*\s*x\s*(\d+)/gi, (_, group, count) => Array(Number(count)).fill(group).join(", "));
    if (text === before) break;
  }
  return text.replace(/\*/g, "").replace(/[()]/g, " ");
}

function parseInstruction(source, outputStart = 1) {
  const declaredMatch = source.match(/\((\d+)(?:\s*(?:sts?|stitches?))?\)\s*$/i) || source.match(/\b(?:=|total\s+of)\s*(\d+)\s*$/i);
  const declaredCount = declaredMatch ? Number(declaredMatch[1]) : null;
  let text = expandRepeats(declaredMatch ? source.slice(0, declaredMatch.index) : source)
    .replace(/\b(in|into)\s+(?:the\s+)?(?:magic\s+ring|magic\s+circle|mr|next\s+stitch|next\s+space|chain\s+space)\b/gi, " ")
    .replace(/\b(?:work|repeat|each|stitches?|sts?)\b/gi, " ")
    .replace(/\b(?:total\s+of|there\s+are)\b/gi, " ")
    .replace(/\band\b/gi, ",");
  const stitchToken = "(?:BLO\\s+SC|FLO\\s+SC|SL\\s*ST|SC|HDC|DC|TR|INC|DEC|CH|MR|SKIP|SHELL|PUFF|BOBBLE)";
  text = text.replace(new RegExp(`(${stitchToken})(\\s+(?:in\\s+(?:the\\s+)?)?same\\s+(?:stitch|space))?\\s+(?=(?:\\d+\\s*)?${stitchToken}\\b)`, "gi"), "$1$2, ");
  const bits = text.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean);
  const operations = [];
  const problems = [];
  let inputPosition = 1;
  let outputPosition = outputStart;

  for (const bit of bits) {
    if (/^\d+\s*(?:st|nd|rd|th)?\s*$/i.test(bit) || /^\d+$/.test(bit)) continue;
    const sameTarget = /\bin\s+(?:the\s+)?same\s+(?:stitch|space)\b/i.test(bit);
    const normalized = bit.replace(/\b(?:in|into)\s+(?:the\s+)?same\s+(?:stitch|space)\b/gi, " ").trim();
    const pattern = /^(?:(\d+)\s*)?(BLO\s+SC|FLO\s+SC|SL\s*ST|SC|HDC|DC|TR|INC|DEC|CH|MR|SKIP|SHELL|PUFF|BOBBLE)\b(?:\s+(?:in\s+)?(?:next\s+)?(?:stitch|space|chain\s+space))?$/i;
    const match = normalized.match(pattern);
    if (!match) {
      problems.push(bit);
      continue;
    }
    const count = Math.min(Number(match[1] || 1), 80);
    const rawType = match[2].toUpperCase().replace(/\s+/g, "");
    if (sameTarget && count > 1 && ["SC", "HDC", "DC", "TR"].includes(rawType)) {
      const type = "INC";
      const outputs = Array.from({ length: count }, (_, i) => ({ id: makeId(), number: outputPosition + i, done: false }));
      operations.push({ id: makeId(), type, label: `${count} ${rawType} in one stitch`, inputCount: 1, outputCount: count, inputStart: inputPosition, outputs, done: false });
      inputPosition += 1; outputPosition += count;
      continue;
    }
    for (let i = 0; i < count; i += 1) {
      const type = rawType === "SLST" ? "SLST" : rawType;
      const inputCount = type === "INC" ? 1 : type === "DEC" ? 2 : type === "CH" || type === "MR" ? 0 : 1;
      const outputCount = type === "INC" ? 2 : type === "DEC" ? 1 : type === "SKIP" || type === "MR" ? 0 : 1;
      const outputs = Array.from({ length: outputCount }, (_, j) => ({ id: makeId(), number: outputPosition + j, done: false }));
      operations.push({ id: makeId(), type, label: type === "BLOSC" ? "BLO SC" : type === "FLOSC" ? "FLO SC" : type, inputCount, outputCount, inputStart: inputPosition, outputs, done: false });
      inputPosition += inputCount;
      outputPosition += outputCount;
    }
  }
  const outputCount = outputPosition - outputStart;
  const warning = problems.length ? `Couldn't interpret: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "…" : ""}` : "";
  return { operations, inputCount: inputPosition - 1, outputCount, declaredCount, warning };
}

function seedProjects() {
  const parsed = parsePattern(SAMPLE_PATTERN);
  parsed.rounds[0].title = "Start in the ring";
  parsed.rounds[1].title = "Shape the centre";
  parsed.rounds[2].title = "Build the petals";
  parsed.rounds[3].title = "Open the bloom";
  parsed.rounds[4].title = "Finish the edge";
  return [{
    id: makeId(), name: "Tiny tulip", description: "A little bloom, worked from the centre out.", type: "amigurumi",
    originalPattern: SAMPLE_PATTERN, rounds: parsed.rounds, currentRoundId: parsed.rounds[2].id,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }];
}

function repairProjectPattern(project) {
  if (!project?.originalPattern || !Array.isArray(project.rounds) || !project.rounds.length) return project;
  const hasUsableSequence = project.rounds.some((round) => round.operations?.some((operation) => operation.outputs?.length));
  if (hasUsableSequence) return project;

  const previousRound = project.rounds.find((round) => round.id === project.currentRoundId);
  const parsed = parsePattern(project.originalPattern);
  if (!parsed.rounds.some((round) => round.operations.some((operation) => operation.outputs.length))) return project;

  project.rounds = parsed.rounds;
  project.currentRoundId = project.rounds.find((round) => round.label === previousRound?.label)?.id || project.rounds[0].id;
  project.patternRepaired = true;
  return project;
}

function loadProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) return stored.map(repairProjectPattern);
  } catch { /* start from the sample project */ }
  return seedProjects();
}

let projects = loadProjects();
let activeProjectId = projects[0]?.id || null;
let viewMode = "both";
let progressMode = "output";
let undoStack = [];
let inputMode = "paste";
let manualRounds = [];
let pendingImport = null;
let pendingDeleteProjectId = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const toggle = $("#theme-toggle");
  toggle.textContent = dark ? "Light mode" : "Dark mode";
  toggle.setAttribute("aria-pressed", String(dark));
  toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  $("meta[name='theme-color']").content = dark ? "#191918" : "#f5f0e5";
}
function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
}
const activeProject = () => projects.find((project) => project.id === activeProjectId) || projects[0];
const currentRound = () => {
  const project = activeProject();
  return project.rounds.find((round) => round.id === project.currentRoundId) || project.rounds[0];
};
const roundDone = (round) => round.operations.reduce((sum, op) => sum + op.outputs.filter((output) => output.done).length, 0);
const operationDone = (op) => op.outputs.length ? op.outputs.every((output) => output.done) : op.done;
const projectProgress = (project) => {
  const all = project.rounds.flatMap((round) => round.operations.flatMap((op) => op.outputs));
  return all.length ? Math.round(all.filter((output) => output.done).length / all.length * 100) : 0;
};

function persist() {
  const project = activeProject();
  if (project) project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  const state = $("#save-state");
  if (state) state.textContent = "Saved on this device";
}

function formatLabel(label) { return label.replace(/^r(\d+)$/i, "Round $1").replace(/^rnd\s/i, "Round "); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

function renderProjects() {
  const list = $("#project-list");
  list.innerHTML = projects.length ? projects.map((project) => `
    <div class="project-entry">
      <button class="project-item" type="button" data-project="${project.id}" aria-current="${project.id === activeProjectId ? "page" : "false"}">
      <span class="project-swatch" aria-hidden="true">${String(project.name || "L").trim().slice(0, 1).toUpperCase()}</span>
      <span class="project-item-copy"><strong>${escapeHtml(project.name)}</strong><small>${project.rounds.length} rounds · ${projectProgress(project)}% done</small></span>
      </button>
      <button class="project-delete" type="button" data-delete-project="${project.id}" aria-label="Delete project ${escapeHtml(project.name)}" title="Delete project">×</button>
    </div>`).join("") : '<p class="projects-empty">No saved projects.</p>';
  $$("[data-project]", list).forEach((button) => button.addEventListener("click", () => {
    activeProjectId = button.dataset.project;
    undoStack = [];
    render();
  }));
  $$("[data-delete-project]", list).forEach((button) => button.addEventListener("click", () => openDeleteProject(button.dataset.deleteProject)));
}

function openDeleteProject(projectId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;
  pendingDeleteProjectId = projectId;
  $("#delete-dialog-title").textContent = `Delete “${project.name}”?`;
  $("#delete-dialog-message").textContent = "The pattern and saved progress will be removed from this browser.";
  $("#delete-project-dialog").showModal();
  $("#cancel-delete-project").focus();
}

function deleteProject() {
  const index = projects.findIndex((project) => project.id === pendingDeleteProjectId);
  if (index < 0) return;
  const [deleted] = projects.splice(index, 1);
  if (activeProjectId === deleted.id) activeProjectId = projects[Math.min(index, projects.length - 1)]?.id || null;
  pendingDeleteProjectId = null;
  undoStack = [];
  $("#delete-project-dialog").close();
  persist();
  render();
  announce(`${deleted.name} was deleted.`);
}

function renderSequence(round) {
  const grid = $("#sequence-grid");
  const flattened = round.operations.flatMap((op, index) => op.outputs.map((output) => ({ op, output, index })));
  const next = flattened.find((item) => !item.output.done);
  const nextOpIndex = round.operations.findIndex((op) => !operationDone(op));
  grid.className = `sequence-grid view-${viewMode}`;
  grid.innerHTML = round.operations.map((op, index) => {
    const outputsDone = op.outputs.filter((output) => output.done).length;
    const complete = operationDone(op);
    const isCurrent = index === nextOpIndex;
    const outputButtons = op.outputs.map((output) => `<button type="button" class="output-chip" data-output="${op.id}:${output.id}" aria-pressed="${output.done}" aria-label="Output stitch ${output.number}, ${output.done ? "complete" : "not complete"}">${output.number}</button>`).join("");
    const grouping = op.outputCount > 1 ? `${op.outputs[0].number}–${op.outputs.at(-1).number}` : op.outputs[0]?.number ?? "—";
    const instruction = stitchNames[op.type] || op.type;
    const target = op.inputCount === 0 ? "No base stitch" : op.inputCount > 1 ? `Into ${op.inputCount} stitches` : `Base stitch ${op.inputStart}`;
    const completeLabel = complete ? `Reopen ${op.label || instruction}` : `Complete ${op.label || instruction} at base stitch ${op.inputStart}`;
    return `<article class="operation-cell ${isCurrent ? "is-current" : ""} ${complete ? "is-done" : ""}" data-operation="${op.id}">
      <button class="card-hitarea" type="button" data-complete-operation="${op.id}" aria-label="${escapeHtml(completeLabel)}" aria-pressed="${complete}"></button>
      <div class="op-meta"><span>${escapeHtml(grouping)}</span><span>${op.outputCount > 1 ? `${outputsDone}/${op.outputCount}` : complete ? "Done" : ""}</span></div>
      <strong class="op-name">${escapeHtml(op.label && op.label !== op.type ? op.label : instruction)}</strong>
      <span class="op-target">${escapeHtml(target)}</span>
      ${viewMode !== "grouped" && op.outputs.length ? `<div class="output-list">${outputButtons}</div>` : ""}
      ${viewMode !== "individual" ? `<span class="op-complete" aria-hidden="true"><span>${complete ? "✓" : "○"}</span>${op.outputCount > 1 ? "Complete group" : "Complete operation"}</span>` : ""}
    </article>`;
  }).join("");

  $$("[data-output]", grid).forEach((button) => button.addEventListener("click", () => {
    const [opId, outputId] = button.dataset.output.split(":");
    toggleOutput(opId, outputId);
  }));
  $$("[data-complete-operation]", grid).forEach((button) => button.addEventListener("click", () => toggleOperation(button.dataset.completeOperation)));
}

function renderRoundList(project, selectedRound) {
  const list = $("#round-list");
  list.innerHTML = project.rounds.map((round, index) => {
    const done = roundDone(round);
    const total = round.expectedOutput;
    return `<li class="round-row"><button class="round-select" type="button" data-round="${round.id}" aria-current="${round.id === selectedRound.id ? "step" : "false"}">
      <span class="round-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="round-detail"><strong>${escapeHtml(round.title || formatLabel(round.label))}</strong><span>${escapeHtml(round.originalText)}</span></span>
      <span class="round-status ${total > 0 && done === total ? "is-done" : ""}">${total > 0 && done === total ? "✓" : `${done}/${total}`}</span>
    </button></li>`;
  }).join("");
  $$("[data-round]", list).forEach((button) => button.addEventListener("click", () => selectRound(button.dataset.round)));
}

function render() {
  const project = activeProject();
  const hasProject = Boolean(project);
  $("#empty-project-state").hidden = hasProject;
  $("#main .workspace-heading").hidden = !hasProject;
  $("#main .work-grid").hidden = !hasProject;
  $("#main .workspace-footer").hidden = !hasProject;
  $("#open-patterns").hidden = !hasProject;
  renderProjects();
  if (!project) { persist(); return; }
  const round = currentRound();
  if (!round) return;
  const roundIndex = project.rounds.findIndex((item) => item.id === round.id);
  const done = roundDone(round);
  const total = round.expectedOutput;
  const nextOp = round.operations.find((op) => !operationDone(op));
  const nextOutput = nextOp?.outputs.find((output) => !output.done);
  const finished = !nextOp;
  $("#project-crumb").textContent = project.name;
  $("#round-crumb").textContent = formatLabel(round.label);
  $("#project-title").textContent = project.name;
  $("#project-description").textContent = project.description || "A crochet project, ready when you are.";
  $("#round-index").innerHTML = `${escapeHtml(formatLabel(round.label))} <span>of ${String(project.rounds.length).padStart(2, "0")}</span>`;
  $("#round-title").textContent = round.title || formatLabel(round.label);
  $("#round-instruction").textContent = round.originalText;
  $("#progress-count").textContent = `${done} / ${total}`;
  $("#progress-caption").textContent = progressMode === "output" ? "output stitches complete" : "output stitches complete";
  $("#progress-fill").style.transform = `scaleX(${total ? done / total : 0})`;
  $("#progress-bar").setAttribute("aria-valuemax", total);
  $("#progress-bar").setAttribute("aria-valuenow", done);
  $("#round-count-summary").textContent = `${round.operations.length} operations · ${total} output stitches`;
  $("#complete-next").disabled = finished;
  $("#complete-next").innerHTML = finished ? "Round complete" : `Mark ${progressMode === "output" ? "stitch" : "operation"} complete <kbd>Space</kbd>`;
  $("#undo-progress").disabled = undoStack.length === 0;
  $("#next-up-number").textContent = finished ? "All done" : nextOutput ? `Stitch ${nextOutput.number}` : `Operation ${round.operations.indexOf(nextOp) + 1}`;
  $("#next-up-operation").textContent = finished ? "This round is complete" : nextOp.label && nextOp.label !== nextOp.type ? nextOp.label : stitchNames[nextOp.type] || nextOp.type;
  $("#next-up-detail").textContent = finished ? "Choose the next round when you’re ready" : nextOp.outputCount > 1 ? `Work ${nextOp.outputCount} stitches into base stitch ${nextOp.inputStart}` : nextOp.inputCount === 0 ? "Work without using a base stitch" : `Work into base stitch ${nextOp.inputStart}`;
  $("#previous-round").disabled = roundIndex <= 0;
  $("#next-round").disabled = roundIndex >= project.rounds.length - 1;
  $$("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === viewMode)));
  $$("[data-progress]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.progress === progressMode)));
  const note = $("#parse-note");
  const repairMessage = project.patternRepaired ? "This saved pattern was rebuilt from its original instructions. Review the round totals before you continue." : "";
  note.hidden = !round.warning && !repairMessage;
  note.textContent = round.warning || repairMessage;
  renderRoundList(project, round);
  renderSequence(round);
  persist();
}

function selectRound(roundId) {
  const project = activeProject();
  if (!project.rounds.some((round) => round.id === roundId)) return;
  project.currentRoundId = roundId;
  undoStack = [];
  render();
}

function snapshotProgress() {
  const round = currentRound();
  undoStack.push({ roundId: round.id, operations: round.operations.map((op) => ({ done: op.done, outputs: op.outputs.map((output) => output.done) })) });
  if (undoStack.length > 60) undoStack.shift();
}

function advanceWhenComplete(roundId) {
  const project = activeProject();
  const index = project.rounds.findIndex((round) => round.id === roundId);
  const round = project.rounds[index];
  const next = project.rounds[index + 1];
  if (!round || !next || !round.operations.length || !round.operations.every(operationDone)) return;
  window.setTimeout(() => {
    if (currentRound().id !== roundId || !round.operations.every(operationDone)) return;
    project.currentRoundId = next.id;
    announce(`${formatLabel(round.label)} complete. Moving to ${formatLabel(next.label)}.`);
    render();
  }, 500);
}

function toggleOutput(opId, outputId) {
  const op = currentRound().operations.find((item) => item.id === opId);
  const output = op?.outputs.find((item) => item.id === outputId);
  if (!op || !output) return;
  snapshotProgress();
  output.done = !output.done;
  if (op.outputs.every((item) => item.done)) op.done = true;
  else op.done = false;
  render();
  announce(`${output.done ? "Completed" : "Reopened"} stitch ${output.number}.`);
  advanceWhenComplete(currentRound().id);
}

function toggleOperation(opId) {
  const op = currentRound().operations.find((item) => item.id === opId);
  if (!op) return;
  snapshotProgress();
  const next = !operationDone(op);
  op.done = next;
  op.outputs.forEach((output) => { output.done = next; });
  render();
  announce(`${next ? "Completed" : "Reopened"} ${op.label || stitchNames[op.type]}.`);
  advanceWhenComplete(currentRound().id);
}

function completeNext() {
  const round = currentRound();
  const op = round.operations.find((item) => !operationDone(item));
  if (!op) return;
  if (progressMode === "operation" || !op.outputs.length) {
    toggleOperation(op.id);
    return;
  }
  const output = op.outputs.find((item) => !item.done);
  if (output) toggleOutput(op.id, output.id);
}

function undo() {
  const entry = undoStack.pop();
  if (!entry) return;
  const project = activeProject();
  const round = project.rounds.find((item) => item.id === entry.roundId);
  if (!round) return;
  project.currentRoundId = round.id;
  round.operations.forEach((op, index) => {
    op.done = entry.operations[index]?.done || false;
    op.outputs.forEach((output, outputIndex) => { output.done = entry.operations[index]?.outputs[outputIndex] || false; });
  });
  render();
  announce("Progress undone.");
}

function announce(message) { $("#sr-status").textContent = message; }

function changeRound(direction) {
  const project = activeProject();
  const index = project.rounds.findIndex((round) => round.id === project.currentRoundId);
  const target = project.rounds[index + direction];
  if (target) selectRound(target.id);
}

function openDialog(mode = "edit") {
  const project = mode === "new" ? null : activeProject();
  $("#pattern-name").value = project?.name || "";
  $("#pattern-description").value = project?.description || "";
  $("#pattern-source").value = project?.originalPattern || "";
  $("#parse-review").innerHTML = "";
  $("#save-pattern").textContent = mode === "new" ? "Review and save" : "Review changes";
  $("#save-pattern").dataset.action = mode;
  $("#save-pattern").disabled = false;
  pendingImport = null;
  manualRounds = project ? project.rounds.map((round) => ({ label: round.label, instruction: round.originalText })) : [];
  renderManualRounds();
  setInputMode("paste");
  $("#pattern-dialog").showModal();
  $("#pattern-name").focus();
}

function setInputMode(mode) {
  inputMode = mode;
  $$("[data-input-mode]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.inputMode === mode)));
  $("#paste-panel").hidden = mode !== "paste";
  $("#manual-panel").hidden = mode !== "manual";
  pendingImport = null;
  $("#parse-review").innerHTML = "";
  $("#save-pattern").disabled = false;
  const action = $("#save-pattern").dataset.action;
  $("#save-pattern").textContent = action === "new" ? "Review and save" : "Review changes";
}

function renderManualRounds() {
  $("#manual-rounds").innerHTML = manualRounds.map((round, index) => `<li><strong>${escapeHtml(round.label)}</strong><span>${escapeHtml(round.instruction)}</span><button type="button" data-remove-manual="${index}" aria-label="Remove ${escapeHtml(round.label)}">Remove</button></li>`).join("");
  $$('[data-remove-manual]').forEach((button) => button.addEventListener("click", () => {
    manualRounds.splice(Number(button.dataset.removeManual), 1);
    renderManualRounds();
  }));
}

function reviewPattern() {
  const name = $("#pattern-name").value.trim();
  if (!name) {
    $("#pattern-name").setAttribute("aria-invalid", "true");
    $("#pattern-name").focus();
    $("#parse-review").innerHTML = '<p class="review-warning">Add a project name before reviewing the pattern.</p>';
    return;
  }
  $("#pattern-name").removeAttribute("aria-invalid");
  const source = inputMode === "manual" ? manualRounds.map((round) => `${round.label}: ${round.instruction}`).join("\n") : $("#pattern-source").value;
  const parsed = parsePattern(source);
  const warnings = [...parsed.warnings];
  parsed.rounds.forEach((round) => {
    if (round.expectedStitches != null && round.expectedStitches !== round.expectedOutput && !round.warning) {
      round.warning = `Written total is ${round.expectedStitches}; the instructions produce ${round.expectedOutput}.`;
      warnings.push(`${round.label}: ${round.warning}`);
    }
  });
  pendingImport = { rounds: parsed.rounds, source, name, description: $("#pattern-description").value.trim(), warnings, modified: false };
  renderPendingReview();
  $("#save-pattern").textContent = "Accept pattern";
}

function renderPendingReview() {
  if (!pendingImport) return;
  const rows = pendingImport.rounds.map((round, index) => `<div class="review-row"><strong>${escapeHtml(round.label)}</strong><span>${escapeHtml(round.originalText)}</span><span>${round.operations.length} operations · ${round.expectedOutput} out${round.expectedStitches != null ? ` · total ${round.expectedStitches}` : ""}</span><button type="button" data-delete-review-round="${index}" aria-label="Delete ${escapeHtml(round.label)}">Delete</button></div>`).join("");
  const warningMarkup = pendingImport.warnings.length ? `<div class="review-warning">${pendingImport.warnings.map(escapeHtml).join(" ")}</div>` : '<div class="review-warning">The pattern is ready to use. Check the expanded instructions before starting.</div>';
  const emptyMarkup = pendingImport.rounds.length ? "" : '<p class="review-warning">No rounds remain. Add or paste at least one round to save this pattern.</p>';
  $("#parse-review").innerHTML = `${rows}${emptyMarkup}${warningMarkup}`;
  $("#save-pattern").disabled = pendingImport.rounds.length === 0;
  $$('[data-delete-review-round]').forEach((button) => button.addEventListener("click", () => {
    const deleted = pendingImport.rounds.splice(Number(button.dataset.deleteReviewRound), 1)[0];
    if (!deleted) return;
    pendingImport.warnings = pendingImport.warnings.filter((warning) => !warning.startsWith(`${deleted.label}:`));
    pendingImport.modified = true;
    pendingImport.source = pendingImport.rounds.map((round) => `${round.label}: ${round.originalText}${round.expectedStitches != null ? ` (${round.expectedStitches})` : ""}`).join("\n");
    if (inputMode === "paste") $("#pattern-source").value = pendingImport.source;
    if (inputMode === "manual") {
      manualRounds = manualRounds.filter((round) => round.label !== deleted.label || round.instruction !== deleted.originalText);
      renderManualRounds();
    }
    renderPendingReview();
  }));
}

function savePattern() {
  if (!pendingImport) { reviewPattern(); return; }
  if (!pendingImport.rounds.length) return;
  const mode = $("#save-pattern").dataset.action;
  const previous = mode === "new" ? null : activeProject();
  if (previous) {
    previous.name = pendingImport.name;
    previous.description = pendingImport.description;
    previous.originalPattern = pendingImport.source;
    previous.rounds = pendingImport.rounds;
    previous.currentRoundId = pendingImport.rounds[0].id;
    previous.patternRepaired = false;
  } else {
    const project = { id: makeId(), name: pendingImport.name, description: pendingImport.description, type: "custom", originalPattern: pendingImport.source, rounds: pendingImport.rounds, currentRoundId: pendingImport.rounds[0].id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    projects.unshift(project);
    activeProjectId = project.id;
  }
  undoStack = [];
  $("#pattern-dialog").close();
  render();
  announce("Pattern saved and ready to follow.");
}

function addManualRound() {
  const label = $("#manual-label").value.trim() || `Round ${manualRounds.length + 1}`;
  const instruction = $("#manual-instruction").value.trim();
  if (!instruction) { $("#manual-instruction").focus(); return; }
  manualRounds.push({ label, instruction });
  $("#manual-label").value = `Round ${manualRounds.length + 1}`;
  $("#manual-instruction").value = "";
  renderManualRounds();
  $("#manual-instruction").focus();
}

$("#new-project").addEventListener("click", () => openDialog("new"));
$("#empty-create-project").addEventListener("click", () => openDialog("new"));
$("#confirm-delete-project").addEventListener("click", deleteProject);
$("#cancel-delete-project").addEventListener("click", () => $("#delete-project-dialog").close());
$("#delete-project-dialog").addEventListener("close", () => { pendingDeleteProjectId = null; });
$("#open-patterns").addEventListener("click", () => openDialog());
$("#theme-toggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#edit-pattern-inline").addEventListener("click", () => openDialog());
$("#rename-project").addEventListener("click", () => openDialog());
$("#complete-next").addEventListener("click", completeNext);
$("#undo-progress").addEventListener("click", undo);
$("#previous-round").addEventListener("click", () => changeRound(-1));
$("#next-round").addEventListener("click", () => changeRound(1));
$("#cancel-edit").addEventListener("click", () => $("#pattern-dialog").close());
$("#save-pattern").addEventListener("click", savePattern);
$("#add-manual-round").addEventListener("click", addManualRound);
$$('[data-input-mode]').forEach((tab) => tab.addEventListener("click", () => setInputMode(tab.dataset.inputMode)));
$$('[data-view]').forEach((button) => button.addEventListener("click", () => { viewMode = button.dataset.view; render(); }));
$$('[data-progress]').forEach((button) => button.addEventListener("click", () => { progressMode = button.dataset.progress; render(); }));
$("#pattern-dialog").addEventListener("click", (event) => { if (event.target === $("#pattern-dialog")) $("#pattern-dialog").close(); });
$("#pattern-dialog").addEventListener("close", () => { pendingImport = null; });
document.addEventListener("keydown", (event) => {
  if ($("#pattern-dialog").open || $("#delete-project-dialog").open) return;
  if (event.code === "Space" && !["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement.tagName)) {
    event.preventDefault(); completeNext();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
});

applyTheme(document.documentElement.dataset.theme || "light");
render();
