import { parsePattern as parsePatternSource, parseRoundDraft, STITCHES } from "./lib/parser/index.js";
const STORAGE_KEY = "loopwork-projects-v1";
const THEME_KEY = "loopwork-theme-v1";
const API_URL = "/api/projects";
const DIRTY_KEY = "loopwork-unsynced-v1";
const SAMPLE_PATTERN = `Round 1: 6 SC in MR
Round 2: (1 SC, INC) × 6
Round 3: (2 SC, INC) × 6
Round 4: (3 SC, INC) × 6
Round 5: 30 SC`;

const stitchNames = Object.fromEntries(Object.values(STITCHES).map((stitch) => [stitch.type, stitch.label]));

function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function materializeOperation(operation) {
  return {
    id: makeId(),
    type: operation.type,
    label: operation.label,
    inputCount: operation.inputCount,
    outputCount: operation.outputCount,
    inputStart: operation.inputStart,
    done: false,
    outputs: Array.from({ length: operation.outputCount }, (_, index) => ({
      id: makeId(),
      number: operation.outputStart + index,
      done: false
    }))
  };
}

function materializeRound(draft) {
  return {
    id: makeId(),
    label: draft.label,
    title: draft.title || draft.label,
    originalText: draft.instruction,
    operations: draft.operations.map(materializeOperation),
    expectedInput: draft.inputCount,
    expectedOutput: draft.outputCount,
    expectedStitches: draft.declaredTotal,
    workings: draft.workings || "",
    issues: draft.issues || [],
    status: draft.status,
    warning: draft.warning || "",
    inferredMessage: draft.inferredMessage || "",
    worksIntoRing: Boolean(draft.worksIntoRing),
    complete: false
  };
}

function makeRound(label, instruction, options = {}) {
  const draft = parseRoundDraft(label, instruction, { outputStart: options.startOutput || 1 });
  return { ...materializeRound(draft), title: options.title || label };
}

// The pattern engine owns all reading and counting; the app only adds ids and
// progress state on top of what it returns.
function parsePattern(text) {
  const parsed = parsePatternSource(text);
  return { rounds: (parsed.rounds || []).map(materializeRound), warnings: parsed.warnings || [] };
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

  const parsed = parsePattern(project.originalPattern);
  if (!parsed.rounds.length) return project;

  // A stored round is stale when re-reading the original text disagrees with
  // it. That catches rounds expanded by an older, less accurate reading.
  const stale = project.rounds.length !== parsed.rounds.length || project.rounds.some((round, index) => {
    const fresh = parsed.rounds[index];
    if (!fresh) return true;
    return round.label !== fresh.label
      || round.expectedOutput !== fresh.expectedOutput
      || round.status !== fresh.status
      || round.warning !== fresh.warning
      || (round.operations?.length ?? 0) !== fresh.operations.length;
  });
  if (!stale) return project;

  const previousRound = project.rounds.find((round) => round.id === project.currentRoundId);
  const previousByLabel = new Map(project.rounds.map((round) => [round.label, round]));
  if (!parsed.rounds.some((round) => round.operations.length)) return project;

  // Keep ticks where the regenerated round has the same shape.
  project.rounds = parsed.rounds.map((fresh, index) => {
    const old = project.rounds[index]?.label === fresh.label ? project.rounds[index] : previousByLabel.get(fresh.label);
    if (!old || (old.operations?.length ?? 0) !== fresh.operations.length) return fresh;
    fresh.operations.forEach((operation, operationIndex) => {
      const oldOperation = old.operations[operationIndex];
      if (!oldOperation) return;
      operation.done = Boolean(oldOperation.done);
      operation.outputs.forEach((output, outputIndex) => {
        output.done = Boolean(oldOperation.outputs?.[outputIndex]?.done);
      });
    });
    return fresh;
  });
  project.currentRoundId = project.rounds.find((round) => round.label === previousRound?.label)?.id || project.rounds[0].id;
  project.patternRepaired = true;
  return project;
}

function cacheProjects() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch { /* keep working from memory when browser storage is unavailable */ }
}

function readCachedProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) return stored.map(repairProjectPattern);
  } catch { /* start from the sample project */ }
  return null;
}

function loadProjects() {
  return readCachedProjects() ?? seedProjects();
}

function setSaveState(message) {
  const state = $("#save-state");
  if (state) state.textContent = message;
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
let serverReady = false;
let restoring = false;
let booted = false;
let saveTimer = null;
let saveAttempts = 0;
let retryTimer = null;
let saveChain = Promise.resolve();

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

function markDirty() {
  try { localStorage.setItem(DIRTY_KEY, "1"); } catch { /* nothing to record */ }
}

function clearDirty() {
  try { localStorage.removeItem(DIRTY_KEY); } catch { /* nothing to clear */ }
}

function hasUnsyncedChanges() {
  try { return localStorage.getItem(DIRTY_KEY) === "1"; } catch { return false; }
}

function persist() {
  if (restoring) return;
  const project = activeProject();
  if (project) project.updatedAt = new Date().toISOString();
  cacheProjects();
  if (booted) markDirty();
  if (!serverReady) {
    setSaveState("Not saving to Neon — kept in this browser");
    return;
  }
  setSaveState("Saving…");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveToServer, 400);
}

function sendProjects(keepalive = false) {
  return fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projects }),
    keepalive
  });
}

function saveToServer() {
  saveTimer = null;
  saveChain = saveChain.then(async () => {
    try {
      const response = await sendProjects();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      saveAttempts = 0;
      window.clearTimeout(retryTimer);
      clearDirty();
      setSaveState("Saved to Neon");
    } catch (error) {
      markDirty();
      saveAttempts += 1;
      setSaveState(`Not saving to Neon (${error.message}) — kept in this browser`);
      if (saveAttempts < 5) {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(saveToServer, Math.min(2000 * saveAttempts, 10000));
      }
    }
  });
  return saveChain;
}

async function syncFromServer() {
  const bootIds = projects.map((project) => project.id).join("|");
  let payload = null;
  let failure = "unreachable";
  for (let attempt = 0; attempt < 3 && !payload; attempt += 1) {
    try {
      const response = await fetch(API_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      payload = await response.json();
    } catch (error) {
      failure = error.message;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  }
  if (!payload) {
    serverReady = false;
    setSaveState(`Not saving to Neon (${failure}) — kept in this browser`);
    return;
  }
  serverReady = true;
  // Always restore from the server so progress is consistent across devices.
  // The DIRTY_KEY mechanism still protects against losing work within a single
  // device (the 400ms save debounce + pagehide retry); cross-device sync uses
  // the server as the single source of truth.
  restoring = true;
  try {
    projects = payload.projects.map(repairProjectPattern);
    if (!projects.some((project) => project.id === activeProjectId)) activeProjectId = projects[0]?.id || null;
    undoStack = [];
    render();
  } finally {
    restoring = false;
  }
  clearDirty();
  setSaveState("Saved to Neon");
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
  $("#delete-dialog-message").textContent = "The pattern and saved progress will be removed for good.";
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
  $("#round-count-summary").textContent = `${round.operations.length} operations · ${total} output stitches${round.worksIntoRing ? " · works into the ring" : ""}`;
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
  // Every status reaches the page, not just the warning text: inferred counts,
  // review checks and blocked rounds each look different.
  note.dataset.status = round.status || "clear";
  note.hidden = !round.warning && !round.inferredMessage && !repairMessage;
  note.textContent = round.warning || round.inferredMessage || repairMessage;
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
  setReviewState("unreviewed");
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
  setReviewState("unreviewed");
}

function renderManualRounds() {
  $("#manual-rounds").innerHTML = manualRounds.map((round, index) => `<li><strong>${escapeHtml(round.label)}</strong><span>${escapeHtml(round.instruction)}</span><button type="button" data-remove-manual="${index}" aria-label="Remove ${escapeHtml(round.label)}">Remove</button></li>`).join("");
  $$('[data-remove-manual]').forEach((button) => button.addEventListener("click", () => {
    manualRounds.splice(Number(button.dataset.removeManual), 1);
    renderManualRounds();
    markPendingStale();
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
  pendingImport = { rounds: parsed.rounds, source, name, description: $("#pattern-description").value.trim(), warnings, modified: false, stale: false };
  renderPendingReview();
  $("#save-pattern").textContent = "Accept pattern";
  setReviewState("reviewed");
}

// Three review states: nothing read yet, read and matching the text, or read
// and then edited. A stale review can never be accepted, so an old parse can
// not be saved over text the user has since changed.
function setReviewState(state) {
  const again = $("#review-again");
  const save = $("#save-pattern");
  if (!again || !save) return;
  again.hidden = state === "unreviewed";
  const empty = state === "reviewed" && (!pendingImport || pendingImport.rounds.length === 0);
  save.disabled = state === "stale" || Boolean(empty);
}

function markPendingStale() {
  if (!pendingImport || pendingImport.stale) return;
  pendingImport.stale = true;
  setReviewState("stale");
  const review = $("#parse-review");
  if (review && !$("#review-stale")) {
    review.insertAdjacentHTML(
      "afterbegin",
      '<p class="review-warning" id="review-stale">The instructions changed since this review. Choose “Review changes” to read them again.</p>'
    );
  }
}

function renderPendingReview() {
  if (!pendingImport) return;
  const rows = pendingImport.rounds.map((round, index) => {
    // Review has to show what the line was read as, and say plainly when the
    // written total and the arithmetic disagree, so it can be checked at a glance.
    const detail = round.warning
      ? `<span class="review-change is-check">${escapeHtml(round.warning)}</span>`
      : round.workings
        ? `<span class="review-change">${escapeHtml(round.workings)}</span>`
        : "";
    return `<div class="review-row"><strong>${escapeHtml(round.label)}</strong><span>${escapeHtml(round.originalText)}${detail}</span><span>${round.operations.length} operations · ${round.expectedOutput} out${round.expectedStitches != null ? ` · total ${round.expectedStitches}` : ""}</span><button type="button" data-delete-review-round="${index}" aria-label="Delete ${escapeHtml(round.label)}">Delete</button></div>`;
  }).join("");
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
  if (pendingImport.stale) { markPendingStale(); reviewPattern(); return; }
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
  markPendingStale();
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
$("#review-again").addEventListener("click", reviewPattern);
["#pattern-source", "#pattern-name", "#pattern-description"].forEach((selector) => {
  $(selector).addEventListener("input", markPendingStale);
});
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
booted = true;
syncFromServer();

// Never lose the newest change when the tab is closed or reloaded.
window.addEventListener("pagehide", () => {
  if (!serverReady || !hasUnsyncedChanges()) return;
  window.clearTimeout(saveTimer);
  sendProjects(true).catch(() => { /* the next load retries from the browser copy */ });
});

// Catch up after sleeping, or after the database comes back.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (!serverReady) { syncFromServer(); return; }
  if (hasUnsyncedChanges()) saveToServer();
});
