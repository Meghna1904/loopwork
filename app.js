import { parseDocument, documentRounds, parseRoundDraft, STITCHES } from "./lib/parser/index.js";
import { DEFAULT_SYSTEM, confirmedTerminology, normaliseSystem, operationAbbr, operationLabel } from "./lib/terminology.js";
import { mountGuide, renderGuide } from "./guide.js";
const STORAGE_KEY = "loopwork-projects-v1";
const THEME_KEY = "loopwork-theme-v1";
const API_URL = "/api/projects";
const SESSION_URL = "/api/session";
const SESSION_KEY = "loopwork-session-v1";
const DIRTY_KEY = "loopwork-unsynced-v1";
const TERMS_KEY = "loopwork-terms-v1";
const SAMPLE_PATTERN = `Round 1: 6 SC in MR
Round 2: (1 SC, INC) × 6
Round 3: (2 SC, INC) × 6
Round 4: (3 SC, INC) × 6
Round 5: 30 SC`;

const stitchNames = Object.fromEntries(Object.values(STITCHES).map((stitch) => [stitch.type, stitch.label]));

function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function readTermSystem() {
  try {
    return normaliseSystem(localStorage.getItem(TERMS_KEY), DEFAULT_SYSTEM);
  } catch {
    return DEFAULT_SYSTEM;
  }
}

// Changing the system is a choice for the whole app: the guide, the pattern
// viewer and the current project's stored terminology all move together.
function setTermSystem(system) {
  termSystem = normaliseSystem(system, DEFAULT_SYSTEM);
  try { localStorage.setItem(TERMS_KEY, termSystem); } catch { /* storage may be unavailable */ }
  const project = typeof activeProject === "function" ? activeProject() : null;
  if (project) project.terms = termSystem;
}

function operationText(operation) {
  // "As written" never renames anything: a stitch shows the abbreviation the
  // pattern itself used, and a step keeps its own wording.
  if (termMode === "original") return operationAbbr(operation, "US") || operation.label || operation.type;
  return operationLabel(operation, termSystem) || operation.label || operation.type;
}

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
    notes: draft.notes || [],
    part: draft.part || null,
    partQuantity: draft.partQuantity || 1,
    complete: false
  };
}

function makeRound(label, instruction, options = {}) {
  const draft = parseRoundDraft(label, instruction, { outputStart: options.startOutput || 1 });
  return { ...materializeRound(draft), title: options.title || label };
}

// The pattern engine owns all reading and counting; the app only adds ids and
// progress state on top of what it returns. A pasted document (title,
// materials, parts, assembly) is read as a document, and its parts are laid
// out as one round list for the work view.
function parsePattern(text) {
  const parsed = parseDocument(text);
  return { rounds: documentRounds(parsed).map(materializeRound), warnings: parsed.warnings || [] };
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

// The save status is one pill in the navbar: icon, short label, and how long
// ago it saved. It must never wrap or push the other controls around.
const SAVE_KINDS = {
  saved: { icon: "✓", label: "Saved to Neon" },
  saving: { icon: "◌", label: "Saving…" },
  device: { icon: "⚠", label: "Only on this device" },
  error: { icon: "✕", label: "Couldn't save" }
};
let savedAt = 0;

function setSaveState(kind, detail = "") {
  const pill = $("#save-state");
  if (!pill) return;
  const known = SAVE_KINDS[kind] ? kind : "device";
  pill.dataset.kind = known;
  $("#save-icon").textContent = SAVE_KINDS[known].icon;
  $("#save-label").textContent = SAVE_KINDS[known].label;
  $("#save-retry").hidden = known !== "error";
  pill.title = detail || SAVE_KINDS[known].label;
  if (known === "saved") savedAt = Date.now();
  updateSaveTime();
}

function updateSaveTime() {
  const pill = $("#save-state");
  const time = $("#save-time");
  if (!pill || !time) return;
  if (!savedAt || pill.dataset.kind !== "saved") {
    time.hidden = true;
    return;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
  time.hidden = false;
  time.textContent = seconds < 45 ? "· just now" : seconds < 3600 ? `· ${Math.max(1, Math.round(seconds / 60))} min ago` : "· earlier";
  pill.title = `Saved to Neon ${time.textContent.replace("· ", "")}`;
}

window.setInterval(updateSaveTime, 20000);

// The code is the whole account: no password, no email, nothing to verify. It
// has to travel with every request so the server can tell whose projects these
// are, and it is kept only in this browser.
function readSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (stored && typeof stored.name === "string" && typeof stored.code === "string" && stored.code) {
      return { name: stored.name, code: stored.code };
    }
  } catch { /* sign in again */ }
  return null;
}

function writeSession(next) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* memory only */ }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing to clear */ }
}

let session = readSession();
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
// Terminology is a display choice the reader makes, never something inferred
// from a pattern's abbreviations. "original" keeps the text as it was written.
let termSystem = readTermSystem();
let termMode = "terms";
let pendingTerms = termSystem;
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
  toggle.textContent = dark ? "☀" : "☾";
  toggle.setAttribute("aria-pressed", String(dark));
  toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  toggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
  const menuTheme = $("#menu-theme");
  if (menuTheme) menuTheme.innerHTML = `<span aria-hidden="true">${dark ? "☀" : "☾"}</span> ${dark ? "Light mode" : "Dark mode"}`;
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
  if (!session) {
    setSaveState("device");
    return;
  }
  if (booted) markDirty();
  if (!serverReady) {
    setSaveState("device");
    return;
  }
  setSaveState("saving");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveToServer, 400);
}

function sendProjects(keepalive = false) {
  return fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Loopwork-Code": session?.code || "" },
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
      setSaveState("saved");
      flushDeletes();
    } catch (error) {
      markDirty();
      saveAttempts += 1;
      setSaveState("error", `Couldn't save to Neon (${error.message}).`);
      if (saveAttempts < 5) {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(saveToServer, Math.min(2000 * saveAttempts, 10000));
      }
    }
  });
  return saveChain;
}

let pendingDeletes = [];

// Removing a project is its own request, so a stale list can never delete one by
// omission. If the request cannot be sent yet, it waits and is retried.
function queueDelete(id) {
  if (!id) return;
  if (!pendingDeletes.includes(id)) pendingDeletes.push(id);
  flushDeletes();
}

async function flushDeletes() {
  if (!session || !serverReady || !pendingDeletes.length) return;
  const ids = pendingDeletes.slice();
  try {
    const response = await fetch(API_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Loopwork-Code": session.code },
      body: JSON.stringify({ ids })
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    pendingDeletes = pendingDeletes.filter((id) => !ids.includes(id));
  } catch (error) {
    setSaveState("error", `Couldn't remove the project from Neon (${error.message}).`);
  }
}

async function syncFromServer() {
  if (!session) return false;
  let payload = null;
  let failure = "unreachable";
  for (let attempt = 0; attempt < 3 && !payload; attempt += 1) {
    try {
      const response = await fetch(API_URL, {
        headers: { Accept: "application/json", "X-Loopwork-Code": session.code },
        cache: "no-store"
      });
      if (response.status === 401) {
        openLoginScreen("That code is not signed in. Enter it again.");
        return false;
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      payload = await response.json();
    } catch (error) {
      failure = error.message;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  }
  if (!payload) {
    serverReady = false;
    setSaveState("device", `Not saving to Neon (${failure}).`);
    return false;
  }
  serverReady = true;
  // Work that has not reached the server yet is merged with the server copy and
  // pushed back, so neither side can erase the other. A clean browser simply
  // adopts the server, which is what keeps two devices in step.
  const localPending = hasUnsyncedChanges() && projects.length > 0;
  restoring = true;
  try {
    projects = localPending ? mergeProjects(projects, payload.projects) : payload.projects.map(repairProjectPattern);
    if (!projects.some((project) => project.id === activeProjectId)) activeProjectId = projects[0]?.id || null;
    undoStack = [];
    render();
  } finally {
    restoring = false;
  }
  clearDirty();
  setSaveState("saved");
  if (localPending) saveToServer();
  else flushDeletes();
  return true;
}

// Both copies of the list, united: the newer version of a project wins, and a
// project only one side knows about is kept either way.
function mergeProjects(local, remote) {
  const byId = new Map(remote.map((project) => [project.id, project]));
  for (const project of local) {
    const other = byId.get(project.id);
    if (!other) { byId.set(project.id, project); continue; }
    const localTime = Date.parse(project.updatedAt || 0) || 0;
    const remoteTime = Date.parse(other.updatedAt || 0) || 0;
    // The saved table has no column for the confirmed terminology, so a fetched
    // copy arrives without it. The choice made on this device is kept rather
    // than silently forgotten.
    if (!other.terms && project.terms) other.terms = project.terms;
    byId.set(project.id, localTime >= remoteTime ? project : other);
  }
  const order = remote.map((project) => project.id).filter((id) => byId.has(id));
  for (const project of local) if (!order.includes(project.id)) order.push(project.id);
  return order.map((id) => repairProjectPattern(byId.get(id)));
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
  queueDelete(deleted.id);
  persist();
  render();
  announce(`${deleted.name} was deleted.`);
}

function renderSequence(round) {
  const grid = $("#sequence-grid");
  const flattened = round.operations.flatMap((op, index) => op.outputs.map((output) => ({ op, output, index })));
  const next = flattened.find((item) => !item.output.done);
  const nextKey = next ? `${next.op.id}:${next.output.id}` : null;
  const nextOpIndex = round.operations.findIndex((op) => !operationDone(op));
  grid.className = `sequence-grid view-${viewMode}`;
  grid.innerHTML = round.operations.map((op, index) => {
    const outputsDone = op.outputs.filter((output) => output.done).length;
    const complete = operationDone(op);
    const isCurrent = index === nextOpIndex;
    const outputButtons = op.outputs.map((output) => {
      // Stitches are worked in sequence, so only the next one can be marked.
      // Anything already done can still be reopened for a correction.
      const locked = !output.done && `${op.id}:${output.id}` !== nextKey;
      const label = output.done
        ? `Output stitch ${output.number}, complete`
        : locked
          ? `Output stitch ${output.number}, locked until the earlier stitches are done`
          : `Output stitch ${output.number}, not complete`;
      return `<button type="button" class="output-chip${locked ? " is-locked" : ""}" data-output="${op.id}:${output.id}" aria-pressed="${output.done}"${locked ? " disabled title=\"Work in order — finish the earlier stitches first\"" : ""} aria-label="${label}">${output.number}</button>`;
    }).join("");
    const grouping = op.outputCount > 1 ? `${op.outputs[0].number}–${op.outputs.at(-1).number}` : op.outputs[0]?.number ?? "—";
    const instruction = operationText(op);
    const abbr = termMode === "terms" ? operationAbbr(op, termSystem) : "";
    const target = op.inputCount === 0 ? "No base stitch" : op.inputCount > 1 ? `Into ${op.inputCount} stitches` : `Base stitch ${op.inputStart}`;
    // A whole operation can only be ticked once the ones before it are done.
    const lockedOp = !complete && round.operations.slice(0, index).some((item) => !operationDone(item));
    const completeLabel = complete ? `Reopen ${op.label || instruction}` : lockedOp ? `${op.label || instruction} is locked until the earlier operations are done` : `Complete ${op.label || instruction} at base stitch ${op.inputStart}`;
    return `<article class="operation-cell ${isCurrent ? "is-current" : ""} ${complete ? "is-done" : ""}" data-operation="${op.id}">
      <button class="card-hitarea" type="button" data-complete-operation="${op.id}" aria-label="${escapeHtml(completeLabel)}" aria-pressed="${complete}"${lockedOp ? " disabled" : ""}></button>
      <div class="op-meta"><span>${escapeHtml(grouping)}</span><span>${op.outputCount > 1 ? `${outputsDone}/${op.outputCount}` : complete ? "Done" : ""}</span></div>
      <strong class="op-name">${escapeHtml(instruction)}${abbr ? ` <span class="op-abbr">${escapeHtml(abbr)}</span>` : ""}</strong>
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

// ---- photos ----------------------------------------------------------------

const PHOTO_KINDS = { reference: "What I'm making", result: "What I made" };
const MAX_PHOTOS_PER_KIND = 12;
let pendingPhotoKind = "reference";
let openPhotoId = null;
// Uploads in flight and uploads that failed, kept outside the project so a
// half-saved photo is never written to the database as if it were complete.
let pendingUploads = [];
let failedUploads = [];

async function shrinkPhoto(file, maxSide = 900) {
  // Phone photos are several megabytes and the whole project list travels in one
  // save request, so each photo is kept small enough to stay useful and cheap.
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.7);
}

function projectPhotos(project, kind) {
  return (project.photos || []).filter((photo) => photo.kind === kind);
}

function renderPhotos(project) {
  const section = $("#photo-section");
  if (!section) return;
  section.hidden = !project;
  if (!project) {
    $("#aside-photo").hidden = true;
    $("#work-photo").hidden = true;
    return;
  }

  for (const kind of Object.keys(PHOTO_KINDS)) {
    const grid = $(`#photo-grid-${kind}`);
    if (!grid) continue;
    const photos = projectPhotos(project, kind);
    const uploading = pendingUploads.filter((item) => item.kind === kind);
    const failed = failedUploads.filter((item) => item.kind === kind);
    grid.innerHTML = photos.map((photo, index) => `
      <button class="photo-thumb" type="button" data-photo="${photo.id}" aria-label="Open ${escapeHtml(PHOTO_KINDS[kind])} photo ${index + 1}">
        <img src="${photo.data}" alt="${escapeHtml(photo.name || PHOTO_KINDS[kind])}" loading="lazy" />
      </button>`).join("") + uploading.map((item) => `
      <div class="photo-thumb is-uploading" aria-busy="true" aria-label="Adding ${escapeHtml(item.name)}">
        <img src="${item.preview}" alt="" />
        <span class="photo-state">Adding…</span>
      </div>`).join("") + failed.map((item) => `
      <div class="photo-thumb is-failed" role="alert">
        <span class="photo-state">Couldn’t add<br />${escapeHtml(item.name)}</span>
        <button class="photo-dismiss" type="button" data-dismiss-photo="${item.id}" aria-label="Dismiss ${escapeHtml(item.name)}">×</button>
      </div>`).join("") + `
      <button class="photo-add" type="button" data-add-photo="${kind}"${photos.length >= MAX_PHOTOS_PER_KIND ? " disabled" : ""}>
        <span aria-hidden="true">+</span><span>${photos.length ? "Add more" : "Add photos"}</span>
      </button>`;
  }

  $$("[data-add-photo]", section).forEach((button) => button.addEventListener("click", () => {
    pendingPhotoKind = button.dataset.addPhoto;
    const input = $("#photo-input");
    input.value = "";
    input.click();
  }));
  $$("[data-photo]", section).forEach((button) => button.addEventListener("click", () => openPhoto(button.dataset.photo)));
  $$("[data-dismiss-photo]", section).forEach((button) => button.addEventListener("click", () => {
    failedUploads = failedUploads.filter((item) => item.id !== button.dataset.dismissPhoto);
    renderPhotos(activeProject());
  }));
  renderWorkingPhoto(project);
}

// The photo you actually look at while crocheting is the reference photo, so a
// thumbnail of it lives next to the round: in the sticky aside on a wide screen,
// in a small sticky strip above the round on a narrow one. When the project is
// finished, the made photo takes its place.
function renderWorkingPhoto(project) {
  const finished = projectProgress(project) === 100 ? projectPhotos(project, "result").filter((photo) => photo.data).at(-1) : null;
  const reference = projectPhotos(project, "reference").filter((photo) => photo.data).at(-1);
  const shown = finished || reference;
  const kind = finished ? "result" : "reference";
  const caption = finished
    ? "What I made · finished"
    : shown
      ? "Reference · click to open"
      : "Add a photo of what you’re making";

  const aside = $("#aside-photo");
  if (aside) {
    aside.hidden = false;
    const image = $("#aside-photo-image");
    const empty = $("#aside-photo-empty");
    if (shown) {
      image.src = shown.data;
      image.alt = shown.name ? `Reference photo: ${shown.name}` : "Reference photo";
      image.hidden = false;
      empty.hidden = true;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      empty.hidden = false;
    }
    $("#aside-photo-caption").textContent = caption;
    const button = $("#aside-photo-button");
    button.dataset.photo = shown ? shown.id : "";
    button.dataset.add = shown ? "" : kind;
    button.setAttribute("aria-label", shown ? `Open the ${finished ? "finished" : "reference"} photo` : "Add a reference photo");
  }

  const strip = $("#work-photo");
  if (strip) {
    strip.hidden = !shown;
    if (shown) {
      $("#work-photo-image").src = shown.data;
      $("#work-photo-image").alt = "";
      $("#work-photo-label").textContent = finished ? "What I made" : "Reference";
      strip.dataset.photo = shown.id;
      strip.setAttribute("aria-label", `Open the ${finished ? "finished" : "reference"} photo`);
    }
  }
}

function openPhoto(photoId) {
  const photo = (activeProject()?.photos || []).find((item) => item.id === photoId);
  if (!photo) return;
  openPhotoId = photoId;
  $("#photo-dialog-image").src = photo.data;
  $("#photo-dialog-image").alt = photo.name ? `Photo: ${photo.name}` : "Project photo";
  $("#photo-dialog-title").textContent = PHOTO_KINDS[photo.kind] || "Photo";
  $("#photo-dialog-caption").textContent = photo.name || "";
  $("#photo-dialog").showModal();
}

async function addPhotos(files) {
  const project = activeProject();
  if (!project || !files.length) return;
  const kind = pendingPhotoKind;
  const room = MAX_PHOTOS_PER_KIND - projectPhotos(project, kind).length - pendingUploads.filter((item) => item.kind === kind).length;
  if (room <= 0) {
    announce(`${PHOTO_KINDS[kind]} already holds ${MAX_PHOTOS_PER_KIND} photos.`);
    return;
  }
  const chosen = files.filter((file) => file.type.startsWith("image/")).slice(0, room);
  if (!chosen.length) {
    announce("Those files are not photos.");
    return;
  }

  // Show the picture straight away, then shrink it. The preview is the file
  // itself, so nothing waits on the resize.
  const tickets = chosen.map((file) => ({ id: makeId(), kind, name: file.name, preview: URL.createObjectURL(file) }));
  pendingUploads = [...pendingUploads, ...tickets];
  renderPhotos(project);

  const added = [];
  for (const [index, file] of chosen.entries()) {
    const ticket = tickets[index];
    try {
      added.push({ id: ticket.id, kind, name: ticket.name, addedAt: new Date().toISOString(), data: await shrinkPhoto(file) });
    } catch {
      failedUploads = [...failedUploads, { id: ticket.id, kind, name: ticket.name }];
    } finally {
      pendingUploads = pendingUploads.filter((item) => item.id !== ticket.id);
      URL.revokeObjectURL(ticket.preview);
    }
    // Each finished photo appears as soon as it is ready.
    if (added.length && project === activeProject()) {
      project.photos = [...(project.photos || []).filter((photo) => !added.some((item) => item.id === photo.id)), ...added];
      render();
    } else {
      renderPhotos(project);
    }
  }

  const skipped = files.length - chosen.length;
  const failed = chosen.length - added.length;
  announce(`${added.length} photo${added.length === 1 ? "" : "s"} added${failed ? `, ${failed} could not be read` : ""}${skipped > 0 ? `, ${skipped} kept out` : ""}.`);
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
  $("#photo-section").hidden = !hasProject;
  renderProjects();
  if (!project) { persist(); return; }
  // A pattern that has had its terminology confirmed is shown in it, whichever
  // project was open before.
  const projectTerms = confirmedTerminology(project, null);
  if (projectTerms && projectTerms !== termSystem) {
    termSystem = projectTerms;
    try { localStorage.setItem(TERMS_KEY, termSystem); } catch { /* storage may be unavailable */ }
  }
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
  // A whole round can be settled in one go for the times it was worked away
  // from the screen; the same button reopens it if that was a mistake.
  const roundAllDone = round.operations.length > 0 && round.operations.every(operationDone);
  $("#complete-round").textContent = roundAllDone ? "Reopen round" : "Mark round done";
  $("#complete-round").disabled = round.operations.length === 0;
  $("#complete-round").setAttribute("aria-pressed", String(roundAllDone));
  $("#undo-progress").disabled = undoStack.length === 0;
  $("#next-up-number").textContent = finished ? "All done" : nextOutput ? `Stitch ${nextOutput.number}` : `Operation ${round.operations.indexOf(nextOp) + 1}`;
  $("#next-up-operation").textContent = finished ? "This round is complete" : operationText(nextOp) || nextOp.type;
  $("#next-up-detail").textContent = finished ? "Choose the next round when you’re ready" : nextOp.outputCount > 1 ? `Work ${nextOp.outputCount} stitches into base stitch ${nextOp.inputStart}` : nextOp.inputCount === 0 ? "Work without using a base stitch" : `Work into base stitch ${nextOp.inputStart}`;
  $("#previous-round").disabled = roundIndex <= 0;
  $("#next-round").disabled = roundIndex >= project.rounds.length - 1;
  $$("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === viewMode)));
  $$("[data-progress]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.progress === progressMode)));
  // The terminology control sits with the sequence: it changes names, never the
  // stored instruction, which stays visible above it exactly as written.
  $$("[data-terms]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.terms === (termMode === "original" ? "original" : termSystem))));
  const termsNote = $("#round-terms-note");
  if (termsNote) {
    const projectTerms = confirmedTerminology(project, null);
    const written = projectTerms ? `Written in ${projectTerms} terms` : "Written-in terms not confirmed";
    termsNote.textContent = termMode === "original"
      ? `${written}. Shown as written, without renaming any stitch.`
      : `${written}. Stitch names shown in ${termSystem} terms; the line above stays exactly as you pasted it.`;
    termsNote.dataset.mode = termMode;
  }
  const note = $("#parse-note");
  const repairMessage = project.patternRepaired ? "This saved pattern was rebuilt from its original instructions. Review the round totals before you continue." : "";
  // Every status reaches the page, not just the warning text: inferred counts,
  // review checks and blocked rounds each look different.
  // Every status reaches the page, not just the warning text: inferred counts,
  // review checks and blocked rounds each look different. Notes written around
  // a round (eyes, stuffing, fasten off) are shown with it, never as errors.
  note.dataset.status = round.status || "clear";
  const roundNotes = (round.notes || []).map((item) => (item.hint ? `${item.text} (${item.hint})` : item.text)).join(" ");
  note.hidden = !round.warning && !round.inferredMessage && !repairMessage && !roundNotes;
  note.textContent = [round.warning, round.inferredMessage, repairMessage, roundNotes].filter(Boolean).join(" ");
  renderRoundList(project, round);
  renderSequence(round);
  renderPhotos(project);
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

// The round is a sequence, not a checklist: only the next unfinished stitch can
// be marked, so a glance at the sequence always matches what is in the hands.
function nextStitch(round) {
  for (const op of round.operations) {
    const output = op.outputs.find((item) => !item.done);
    if (output) return { op, output };
  }
  return null;
}

function toggleOutput(opId, outputId) {
  const round = currentRound();
  const op = round.operations.find((item) => item.id === opId);
  const output = op?.outputs.find((item) => item.id === outputId);
  if (!op || !output) return;
  if (!output.done) {
    const next = nextStitch(round);
    if (!next || next.output.id !== output.id) {
      announce(next ? `Work in order — stitch ${next.output.number} comes first.` : "This round is already complete.");
      return;
    }
  }
  snapshotProgress();
  output.done = !output.done;
  if (op.outputs.every((item) => item.done)) op.done = true;
  else op.done = false;
  render();
  announce(`${output.done ? "Completed" : "Reopened"} stitch ${output.number}.`);
  advanceWhenComplete(currentRound().id);
}

function toggleOperation(opId) {
  const round = currentRound();
  const op = round.operations.find((item) => item.id === opId);
  if (!op) return;
  const next = !operationDone(op);
  if (next && round.operations.slice(0, round.operations.indexOf(op)).some((item) => !operationDone(item))) {
    const first = round.operations.find((item) => !operationDone(item));
    announce(`Work in order — ${first?.label || stitchNames[first?.type] || "the earlier operation"} comes first.`);
    return;
  }
  snapshotProgress();
  op.done = next;
  op.outputs.forEach((output) => { output.done = next; });
  render();
  announce(`${next ? "Completed" : "Reopened"} ${op.label || stitchNames[op.type]}.`);
  advanceWhenComplete(currentRound().id);
}

function toggleRoundComplete() {
  const round = currentRound();
  if (!round.operations.length) return;
  const markDone = !round.operations.every(operationDone);
  snapshotProgress();
  round.operations.forEach((op) => {
    op.done = markDone;
    op.outputs.forEach((output) => { output.done = markDone; });
  });
  render();
  announce(markDone ? `${formatLabel(round.label)} marked complete.` : `${formatLabel(round.label)} reopened.`);
  if (markDone) advanceWhenComplete(round.id);
}

function completeNext() {
  const round = currentRound();
  const op = round.operations.find((item) => !operationDone(item));
  if (!op) return;
  if (progressMode === "operation" || !op.outputs.length) {
    toggleOperation(op.id);
    return;
  }
  // The next stitch is whatever comes first in the sequence, so a partly marked
  // operation finishes before the following one starts.
  const next = nextStitch(round) || { op, output: op.outputs.find((item) => !item.done) };
  if (next.output) toggleOutput(next.op.id, next.output.id);
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
  // An existing project keeps the terms it was saved with; a new one starts
  // from the reader's current choice. Either way it is shown, never guessed.
  pendingTerms = confirmedTerminology(project, termSystem) || termSystem;
  renderPatternTerms();
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
  pendingImport = { rounds: parsed.rounds, source, name, description: $("#pattern-description").value.trim(), terms: pendingTerms, warnings, modified: false, stale: false };
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
    previous.terms = pendingImport.terms || termSystem;
    previous.originalPattern = pendingImport.source;
    previous.rounds = pendingImport.rounds;
    previous.currentRoundId = pendingImport.rounds[0].id;
    previous.patternRepaired = false;
  } else {
    const project = { id: makeId(), name: pendingImport.name, description: pendingImport.description, terms: pendingImport.terms || termSystem, type: "custom", originalPattern: pendingImport.source, rounds: pendingImport.rounds, currentRoundId: pendingImport.rounds[0].id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    projects.unshift(project);
    activeProjectId = project.id;
  }
  undoStack = [];
  $("#pattern-dialog").close();
  render();
  announce("Pattern saved and ready to follow.");
}

function renderPatternTerms() {
  $$("[data-pattern-terms]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.patternTerms === pendingTerms)));
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
$("#complete-round").addEventListener("click", toggleRoundComplete);
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
$$('[data-terms]').forEach((button) => button.addEventListener("click", () => {
  const value = button.dataset.terms;
  if (value === "original") termMode = "original";
  else { termMode = "terms"; setTermSystem(value); }
  render();
  renderGuide();
}));
$$('[data-pattern-terms]').forEach((button) => button.addEventListener("click", () => {
  pendingTerms = button.dataset.patternTerms;
  renderPatternTerms();
}));
$("#open-guide").addEventListener("click", () => { location.hash = "#guide"; });
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

// ---- sign in with a name and a code -------------------------------------

function openLoginScreen(message = "") {
  session = null;
  clearSession();
  serverReady = false;
  booted = false;
  projects = [];
  activeProjectId = null;
  undoStack = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing cached */ }
  clearDirty();
  setAccountChrome();
  setSaveState("device");
  const screen = $("#login-screen");
  screen.hidden = false;
  const error = $("#login-error");
  error.hidden = !message;
  error.textContent = message;
  $("#login-name").focus();
}

async function startApp() {
  $("#login-screen").hidden = true;
  setAccountChrome();
  render();
  booted = true;
  const synced = await syncFromServer();
  // A code nobody has used yet opens an empty workspace; the sample pattern is
  // friendlier than a blank page, and it is saved to the new account.
  if (synced && session && !projects.length) {
    projects = seedProjects();
    activeProjectId = projects[0].id;
    render();
    persist();
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const name = $("#login-name").value.trim();
  const code = $("#login-code").value.trim();
  const error = $("#login-error");
  if (!name || !code) {
    error.hidden = false;
    error.textContent = "Enter both a name and a code.";
    return;
  }
  const submit = $("#login-submit");
  submit.disabled = true;
  submit.textContent = "Opening…";
  error.hidden = true;
  try {
    const response = await fetch(SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      error.hidden = false;
      error.textContent = payload.message || "Could not open your projects. Try again.";
      return;
    }
    session = { name: payload.name, code: payload.code };
    writeSession(session);
    // Never carry the previous account's projects into this one.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing cached */ }
    projects = [];
    activeProjectId = null;
    undoStack = [];
    $("#login-code").value = session.code;
    await startApp();
    announce(`Signed in as ${session.name}.`);
  } catch {
    error.hidden = false;
    error.textContent = "Could not reach the server. Check your connection and try again.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Open my projects";
  }
}

$("#photo-input").addEventListener("change", (event) => addPhotos([...(event.target.files || [])]));
// The working thumbnail is the fastest way to add a photo: an empty one opens
// the picker, a full one opens the lightbox.
for (const selector of ["#aside-photo-button", "#work-photo"]) {
  $(selector).addEventListener("click", () => {
    const button = $(selector);
    if (button.dataset.photo) { openPhoto(button.dataset.photo); return; }
    pendingPhotoKind = button.dataset.add || "reference";
    const input = $("#photo-input");
    input.value = "";
    input.click();
  });
}
$("#photo-dialog-close").addEventListener("click", () => $("#photo-dialog").close());
$("#photo-dialog-delete").addEventListener("click", () => {
  const project = activeProject();
  if (!project || !openPhotoId) return;
  project.photos = (project.photos || []).filter((photo) => photo.id !== openPhotoId);
  openPhotoId = null;
  $("#photo-dialog").close();
  render();
  announce("Photo removed.");
});
$("#photo-dialog").addEventListener("close", () => {
  openPhotoId = null;
  $("#photo-dialog-image").src = "";
});

$("#login-form").addEventListener("submit", submitLogin);

// ---- navbar menu ---------------------------------------------------------

function toggleMenu(force) {
  const menu = $("#nav-menu");
  if (!menu) return;
  const open = force === undefined ? menu.hidden : force;
  menu.hidden = !open;
  $("#account-button").setAttribute("aria-expanded", String(open));
  $("#nav-menu-button").setAttribute("aria-expanded", String(open));
  if (open) menu.querySelector("button:not([hidden])")?.focus();
}

// Signed in, the avatar carries the name, backup and sign-out. Signed out it is
// a plain "Sign in" button, and the save pill says this device only.
function setAccountChrome() {
  const signedIn = Boolean(session);
  $("#account-avatar").hidden = !signedIn;
  $("#account-name").hidden = !signedIn;
  $(".account-chevron").hidden = !signedIn;
  $("#account-signin").hidden = signedIn;
  $("#account-button").classList.toggle("is-signed-out", !signedIn);
  $("#account-button").setAttribute("aria-haspopup", signedIn ? "menu" : "false");
  if (signedIn) {
    $("#account-avatar").textContent = (session.name.trim()[0] || "L").toUpperCase();
    $("#account-name").textContent = session.name;
    $("#account-button").setAttribute("aria-label", `Account menu for ${session.name}`);
  } else {
    $("#account-button").setAttribute("aria-label", "Sign in");
  }
  $("#nav-menu-head").hidden = !signedIn;
  $("#nav-menu-name").hidden = !signedIn;
  $("#nav-menu-name").textContent = signedIn ? session.name : "";
  $("#menu-signout").hidden = !signedIn;
  $("#menu-signin").hidden = signedIn;
}

function exportBackup() {
  const payload = { exportedAt: new Date().toISOString(), account: session?.name || null, projects };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `loopwork-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("Backup exported.");
}

$("#account-button").addEventListener("click", (event) => {
  event.stopPropagation();
  if (!session) { openLoginScreen(); return; }
  toggleMenu();
});
$("#nav-menu-button").addEventListener("click", (event) => { event.stopPropagation(); toggleMenu(); });
$("#nav-menu").addEventListener("click", (event) => {
  const item = event.target.closest("[data-menu-action]");
  if (!item) return;
  toggleMenu(false);
  const action = item.dataset.menuAction;
  if (action === "edit") openDialog();
  else if (action === "theme") setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  else if (action === "export") exportBackup();
  else if (action === "signout") openLoginScreen("Signed out. Enter your name and code to come back.");
  else if (action === "signin") openLoginScreen();
});
$("#save-retry").addEventListener("click", () => { setSaveState("saving"); saveToServer(); });
document.addEventListener("click", (event) => {
  const menu = $("#nav-menu");
  if (!menu || menu.hidden) return;
  if (event.target.closest("#nav-menu, #account-button, #nav-menu-button")) return;
  toggleMenu(false);
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") toggleMenu(false); });

// ---- stitch guide page -----------------------------------------------------

function routeGuide() {
  const page = $("#guide-page");
  if (!page) return;
  const open = location.hash.startsWith("#guide");
  page.hidden = !open;
  $(".app-shell").hidden = open;
  $("#open-guide").setAttribute("aria-pressed", String(open));
  document.title = open ? "Stitch guide · Loopwork" : "Loopwork · Crochet pattern companion";
  if (open) renderGuide();
  else render();
  window.scrollTo(0, 0);
}

mountGuide({
  getSystem: () => termSystem,
  onSystemChange: (system) => {
    setTermSystem(system);
    // The workspace copy of the sequence follows the same choice, so the two
    // pages can never disagree about what a stitch is called.
    render();
  }
});
window.addEventListener("hashchange", routeGuide);
routeGuide();

applyTheme(document.documentElement.dataset.theme || "light");
if (session) startApp(); else openLoginScreen();

// Never lose the newest change when the tab is closed or reloaded.
window.addEventListener("pagehide", () => {
  if (!session || !serverReady || !hasUnsyncedChanges()) return;
  window.clearTimeout(saveTimer);
  sendProjects(true).catch(() => { /* the next load retries from the browser copy */ });
});

// Catch up after sleeping, or after the database comes back.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !session) return;
  if (!serverReady) { syncFromServer(); return; }
  if (hasUnsyncedChanges()) saveToServer();
  else flushDeletes();
});
