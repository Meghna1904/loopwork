// The Stitch guide page.
//
// Everything shown here comes from lib/terminology.js (names, abbreviations,
// the US/UK table) and lib/guide-data.js (descriptions, steps, examples), so a
// name is never typed twice. The guide owns its own UI state; the app owns the
// chosen terminology so the pattern viewer and the guide always agree.

import {
  GUIDE_TYPES,
  SYSTEMS,
  STITCH_TERMS,
  operationLabel,
  otherSystem,
  stitchAbbr,
  stitchName,
  stitchTitle,
  termFor,
  terminologyTable
} from "./lib/terminology.js";
import { STITCH_GUIDE, TECHNIQUES } from "./lib/guide-data.js";

const FILTERS = [
  { id: "all", label: "All stitches" },
  { id: "chain", label: "Chains & joining" },
  { id: "short", label: "Short stitches" },
  { id: "tall", label: "Tall stitches" }
];

const KIND_LABELS = { chain: "Foundation", join: "Joining", short: "Short", tall: "Tall" };

const state = {
  tab: "stitches",
  filter: "all",
  query: "",
  selectedType: "SC",
  selectedTechnique: "magic-ring",
  mounted: false
};

let hooks = { getSystem: () => "US", onSystemChange: () => {} };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function system() {
  return SYSTEMS.includes(hooks.getSystem()) ? hooks.getSystem() : "US";
}

function stitchEntry(type) {
  return STITCH_GUIDE.find((stitch) => stitch.type === type) || STITCH_GUIDE[0];
}

function searchText(stitch) {
  const { us, uk } = STITCH_TERMS[stitch.type];
  return [stitch.type, us.name, us.abbr, uk.name, uk.abbr, ...(us.aliases || []), ...(uk.aliases || []), stitch.description, ...stitch.steps]
    .join(" ")
    .toLowerCase();
}

function techniqueSearchText(technique) {
  return [technique.name, technique.summary, ...technique.steps, technique.tip || ""].join(" ").toLowerCase();
}

function visibleStitches() {
  const query = state.query.trim().toLowerCase();
  return STITCH_GUIDE.filter((stitch) => {
    if (state.filter !== "all" && stitch.kind !== state.filter) return false;
    return !query || searchText(stitch).includes(query);
  });
}

function visibleTechniques() {
  const query = state.query.trim().toLowerCase();
  return TECHNIQUES.filter((technique) => !query || techniqueSearchText(technique).includes(query));
}

// ---- diagram ---------------------------------------------------------------
//
// An original construction diagram, not a photograph: the dots are the loops
// actually on the hook at each stage, the ticks are the yarn overs, and the
// legend spells out the same numbers. Nothing here imitates a real sample.

// One picture per stage: the hook, the yarn, and the loops actually on it.
// The count under each tile is the same number the description gives, so the
// picture and the words cannot disagree.
function stageGlyph(stitch, count) {
  // The stack is squeezed to fit whatever the stage holds, so five loops never
  // climb into the yarn overs drawn above them.
  const gap = count > 1 ? Math.min(9, 38 / (count - 1)) : 0;
  const loops = Array.from({ length: count }, (_, index) =>
    `<circle class="stage-loop" cx="42" cy="${56 - index * gap}" r="4.2"></circle>`).join("");
  const wraps = Array.from({ length: Math.min(stitch.yarnOvers, 4) }, (_, index) =>
    `<path class="stage-yarnover" d="M${6 + index * 14} 7 l10 8 M${16 + index * 14} 7 l-10 8"></path>`).join("");
  return `<svg class="stage-glyph" viewBox="0 0 96 84" aria-hidden="true" focusable="false">
    ${wraps}
    <path class="stage-hook" d="M70 20 V57 c0 9 -13 9 -13 0 c0 -5 5 -5 6 -1"></path>
    <path class="stage-yarn" d="M6 62 C18 62 28 58 38 59"></path>
    ${loops}
  </svg>`;
}

function stitchStages(stitch, chosen) {
  const term = termFor(stitch.type, chosen);
  const stages = stitch.loops;
  const tiles = stages.map((stage, index) => `<li class="stage-tile">
    <span class="stage-number">${index + 1}</span>
    ${stageGlyph(stitch, stage.count)}
    <span class="stage-name">${escapeHtml(stage.stage)}</span>
    <span class="stage-count">${stage.count} loop${stage.count === 1 ? "" : "s"} on the hook</span>
  </li>`).join("");

  return `<figure class="stitch-figure">
    <figcaption class="stitch-figure-head">${escapeHtml(term.name)} step by step — ${stitch.yarnOvers} yarn over${stitch.yarnOvers === 1 ? "" : "s"}, and the loops the hook holds at each stage.</figcaption>
    <ol class="stage-strip">${tiles}</ol>
    <p class="stitch-figure-note">Original drawings made for this guide: the crosses are the yarn overs, the ring is the hook, the filled dots are the loops on it.</p>
  </figure>`;
}

// ---- cards -----------------------------------------------------------------

function stitchCard(stitch) {
  const chosen = system();
  const term = termFor(stitch.type, chosen);
  const opposite = termFor(stitch.type, otherSystem(chosen));
  const selected = state.selectedType === stitch.type;
  return `<button class="guide-card${selected ? " is-selected" : ""}" type="button" data-stitch="${stitch.type}" aria-pressed="${selected}">
    <span class="guide-card-abbr">${escapeHtml(term.abbr)}</span>
    <span class="guide-card-name">${escapeHtml(term.name)}</span>
    <span class="guide-card-meta">${KIND_LABELS[stitch.kind] || ""}${stitch.turningChain ? ` · ${stitch.turningChain} ch` : ""}</span>
    <span class="guide-card-alt">${chosen === "US" ? "UK" : "US"}: ${escapeHtml(opposite.name)} (${escapeHtml(opposite.abbr)})</span>
  </button>`;
}

function techniqueCard(technique) {
  const selected = state.selectedTechnique === technique.id;
  return `<button class="guide-card guide-card-technique${selected ? " is-selected" : ""}" type="button" data-technique="${technique.id}" aria-pressed="${selected}">
    <span class="guide-card-name">${escapeHtml(technique.name)}</span>
    <span class="guide-card-summary">${escapeHtml(technique.summary)}</span>
  </button>`;
}

// ---- detail ----------------------------------------------------------------

function factsList(stitch, chosen) {
  const term = termFor(stitch.type, chosen);
  const opposite = termFor(stitch.type, otherSystem(chosen));
  return `<dl class="guide-facts">
    <div><dt>${chosen} name</dt><dd>${escapeHtml(term.name)}</dd></div>
    <div><dt>${chosen} abbreviation</dt><dd><code>${escapeHtml(term.abbr)}</code></dd></div>
    <div><dt>${opposite === term ? "" : otherSystem(chosen)} name</dt><dd>${escapeHtml(opposite.name)}</dd></div>
    <div><dt>${otherSystem(chosen)} abbreviation</dt><dd><code>${escapeHtml(opposite.abbr)}</code></dd></div>
    <div><dt>Yarn overs</dt><dd>${stitch.yarnOvers}</dd></div>
    <div><dt>Turning chain</dt><dd>${stitch.turningChain ? `${stitch.turningChain} chain${stitch.turningChain === 1 ? "" : "s"}` : "None — this stitch adds no height"}</dd></div>
  </dl>`;
}

function stitchDetail(stitch) {
  const chosen = system();
  const term = termFor(stitch.type, chosen);
  const opposite = termFor(stitch.type, otherSystem(chosen));
  const related = TECHNIQUES.filter((technique) => technique.id === relatedTechnique(stitch.type)).slice(0, 2);
  return `<article class="guide-entry" aria-labelledby="entry-title-${stitch.type}">
    <p class="guide-entry-kicker">${KIND_LABELS[stitch.kind] || "Stitch"} stitch</p>
    <h2 id="entry-title-${stitch.type}">${escapeHtml(term.name)} <span class="guide-entry-abbr">${escapeHtml(term.abbr)}</span></h2>
    ${opposite.name === term.name ? `<p class="guide-entry-alt">The same name and abbreviation in both systems.</p>` : `<p class="guide-entry-alt">In ${otherSystem(chosen)} terms this is a ${escapeHtml(opposite.name.toLowerCase())} (<code>${escapeHtml(opposite.abbr)}</code>).</p>`}
    <p class="guide-entry-summary">${escapeHtml(stitch.description)}</p>
    ${stitchStages(stitch, chosen)}
    <div class="guide-entry-columns">
      <div>
        <h3>How to work it</h3>
        <ol class="guide-steps">${stitch.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </div>
      <div>
        <h3>In a pattern</h3>
        <p class="guide-example"><code>${escapeHtml(stitch.example[chosen.toLowerCase()])}</code></p>
        <p class="guide-example-note">Written in ${chosen} terms. The same line in ${otherSystem(chosen)} terms:</p>
        <p class="guide-example is-alternate"><code>${escapeHtml(stitch.example[otherSystem(chosen).toLowerCase()])}</code></p>
      </div>
    </div>
    ${factsList(stitch, chosen)}
    ${stitch.tip ? `<p class="guide-tip"><span>Tip</span> ${escapeHtml(stitch.tip)}</p>` : ""}
    ${related.length ? `<p class="guide-related">Read with: ${related.map((technique) => `<button class="text-button" type="button" data-technique="${technique.id}">${escapeHtml(technique.name)}</button>`).join(", ")}</p>` : ""}
  </article>`;
}

function relatedTechnique(type) {
  return type === "CH" ? "turning-chains" : type === "SLST" ? "joining-rounds" : type === "DTR" ? "chain-spaces" : "increase";
}

function techniqueDetail(technique) {
  const chosen = system();
  const usedIn = STITCH_GUIDE.filter((stitch) => {
    if (technique.id === "joining-rounds") return stitch.type === "SLST";
    if (technique.id === "turning-chains") return stitch.turningChain > 0;
    if (technique.id === "chain-spaces") return stitch.kind === "tall";
    if (technique.id === "in-the-round" || technique.id === "magic-ring") return stitch.type === "SC" || stitch.type === "HDC";
    return false;
  });
  return `<article class="guide-entry" aria-labelledby="entry-title-${technique.id}">
    <p class="guide-entry-kicker">Technique</p>
    <h2 id="entry-title-${technique.id}">${escapeHtml(technique.name)}</h2>
    <p class="guide-entry-summary">${escapeHtml(technique.summary)}</p>
    <h3>How to do it</h3>
    <ol class="guide-steps">${technique.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    ${technique.tip ? `<p class="guide-tip"><span>Tip</span> ${escapeHtml(technique.tip)}</p>` : ""}
    ${usedIn.length ? `<p class="guide-related">Stitches used with it: ${usedIn.map((stitch) => `<button class="text-button" type="button" data-stitch="${stitch.type}">${escapeHtml(stitchName(stitch.type, chosen))}</button>`).join(", ")}</p>` : ""}
  </article>`;
}

function termsTable() {
  const rows = terminologyTable();
  const chosen = system();
  return `<article class="guide-entry guide-entry-terms" aria-labelledby="terms-title">
    <p class="guide-entry-kicker">Terminology</p>
    <h2 id="terms-title">US and UK terms, side by side</h2>
    <p class="guide-entry-summary">The stitches are the same; the names and abbreviations are not. A UK double crochet is a US single crochet, so a pattern's terms have to be known before its abbreviations mean anything.</p>
    <table class="terms-table">
      <caption>US and UK names for the seven stitches in this guide</caption>
      <thead><tr><th scope="col">US name</th><th scope="col">US abbreviation</th><th scope="col">UK name</th><th scope="col">UK abbreviation</th></tr></thead>
      <tbody>${rows.map((row) => `<tr class="${row.type === state.selectedType ? "is-selected" : ""}">
        <td>${escapeHtml(row.us.name)}${chosen === "US" ? ' <span class="terms-flag">shown</span>' : ""}</td>
        <td><code>${escapeHtml(row.us.abbr)}</code></td>
        <td>${escapeHtml(row.uk.name)}${chosen === "UK" ? ' <span class="terms-flag">shown</span>' : ""}</td>
        <td><code>${escapeHtml(row.uk.abbr)}</code></td>
      </tr>`).join("")}</tbody>
    </table>
    <ul class="terms-warnings">
      <li><strong>DC</strong> means double crochet in US terms and double crochet in UK terms — but those are different stitches. The US DC equals the UK Tr; the UK DC equals the US SC.</li>
      <li><strong>TC / TR</strong> is the treble in US patterns and a double treble in UK patterns. It is never a single crochet.</li>
      <li>Loopwork never guesses the system from the abbreviations in a pattern. Choose it yourself, and the pattern viewer shows that choice.</li>
    </ul>
    <p class="guide-related">See them worked: ${GUIDE_TYPES.map((type) => `<button class="text-button" type="button" data-stitch="${type}">${escapeHtml(stitchTitle(type, chosen))}</button>`).join(", ")}</p>
  </article>`;
}

// ---- render ----------------------------------------------------------------

function renderFilters() {
  const container = $("#guide-filters");
  if (!container) return;
  const stitching = state.tab === "stitches";
  container.hidden = !stitching;
  if (!stitching) return;
  container.innerHTML = FILTERS.map((filter) => `<button type="button" class="guide-filter" data-filter="${filter.id}" aria-pressed="${state.filter === filter.id}">${filter.label}</button>`).join("");
  $$("[data-filter]", container).forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    render();
  }));
}

function renderTermsButtons() {
  $$("[data-system]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.system === system()));
  });
}

export function renderGuide() {
  const page = $("#guide-page");
  if (!page || page.hidden) return;
  const chosen = system();
  renderTermsButtons();
  renderFilters();
  $$("[data-guide-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.guideTab === state.tab)));

  const search = $("#guide-search");
  if (search && search.value !== state.query) search.value = state.query;

  const results = $("#guide-results");
  const detail = $("#guide-detail");
  const status = $("#guide-status");
  if (!results || !detail) return;
  // The mapping table is a single wide panel, with no card column beside it.
  $(".guide-layout")?.classList.toggle("is-full", state.tab === "terms");

  if (state.tab === "techniques") {
    const items = visibleTechniques();
    status.textContent = `${items.length} technique${items.length === 1 ? "" : "s"}${state.query ? ` matching “${state.query}”` : ""}.`;
    results.innerHTML = items.length
      ? `<div class="guide-cards guide-cards-list">${items.map(techniqueCard).join("")}</div>`
      : `<p class="guide-empty">No technique matches “${escapeHtml(state.query)}”.</p>`;
    const selected = TECHNIQUES.find((technique) => technique.id === state.selectedTechnique) || items[0];
    detail.innerHTML = selected ? techniqueDetail(selected) : "";
  } else if (state.tab === "terms") {
    status.textContent = `Seven stitches, two sets of names. Currently showing ${chosen} terms.`;
    results.innerHTML = "";
    detail.innerHTML = termsTable();
  } else {
    const items = visibleStitches();
    status.textContent = `${items.length} stitch${items.length === 1 ? "" : "es"} shown in ${chosen} terms${state.query ? ` matching “${state.query}”` : ""}.`;
    results.innerHTML = items.length
      ? `<div class="guide-cards">${items.map(stitchCard).join("")}</div>`
      : `<p class="guide-empty">No stitch matches “${escapeHtml(state.query)}”. Try an abbreviation like ${chosen === "US" ? "<code>SC</code>" : "<code>DC</code>"}, or clear the search.</p>`;
    const selected = items.find((stitch) => stitch.type === state.selectedType) || items[0];
    if (selected) state.selectedType = selected.type;
    detail.innerHTML = selected ? stitchDetail(selected) : "";
  }

  $$("[data-stitch]", page).forEach((button) => button.addEventListener("click", () => {
    state.selectedType = button.dataset.stitch;
    state.tab = "stitches";
    render();
  }));
  $$("[data-technique]", page).forEach((button) => button.addEventListener("click", () => {
    state.selectedTechnique = button.dataset.technique;
    state.tab = "techniques";
    render();
  }));
}

function render() {
  renderGuide();
}

export function mountGuide(options = {}) {
  hooks = { ...hooks, ...options };
  if (state.mounted) return;
  state.mounted = true;

  const page = $("#guide-page");
  if (!page) return;

  $$("[data-system]", page).forEach((button) => button.addEventListener("click", () => {
    hooks.onSystemChange(button.dataset.system);
    render();
  }));

  $$("[data-guide-tab]", page).forEach((tab) => tab.addEventListener("click", () => {
    state.tab = tab.dataset.guideTab;
    render();
  }));

  const search = $("#guide-search");
  search?.addEventListener("input", () => {
    state.query = search.value;
    render();
  });
}
