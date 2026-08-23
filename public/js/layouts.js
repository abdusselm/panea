// Reopen-closed-tab history and named saved layouts.
//
// Closed-tab history is an in-memory stack of recently closed tab specs; ⇧⌘T
// (or the palette) pops the most recent one back. Saved layouts are named
// snapshots of the whole workspace, persisted server-side in
// ~/.panea/layouts.json and restorable from the palette.

import { state } from "./state.js";
import { openTabFromSpec, serializeTab } from "./tabs.js";
import { wsSend } from "./ws.js";

// ---- closed-tab history --------------------------------------------------
const CLOSED_CAP = 15;
const closedStack = []; // tab specs, most-recent last

export function recordClosedTab(spec) {
  closedStack.push(spec);
  if (closedStack.length > CLOSED_CAP) closedStack.shift();
}

export function hasClosedTabs() { return closedStack.length > 0; }

export function reopenClosedTab() {
  const spec = closedStack.pop();
  if (spec) openTabFromSpec(spec);
}

// ---- saved layouts -------------------------------------------------------
let savedLayouts = {}; // name -> { tabs: [spec, ...] }

// Called by the ws layer when the server delivers the layout catalog.
export function setLayouts(map) {
  savedLayouts = map && typeof map === "object" ? map : {};
}

export function layoutNames() {
  return Object.keys(savedLayouts).sort((a, b) => a.localeCompare(b));
}

function serializeWorkspace() {
  return { tabs: state.tabs.map(serializeTab) };
}

export function saveCurrentLayout(name) {
  const clean = (name || "").trim();
  if (!clean || !state.tabs.length) return;
  const layout = serializeWorkspace();
  savedLayouts[clean] = layout;             // optimistic; server echoes back
  wsSend({ type: "saveLayout", name: clean, layout });
}

// Restore a saved layout by appending its tabs (non-destructive), then focusing
// the first restored one.
export function openLayout(name) {
  const layout = savedLayouts[name];
  if (!layout || !Array.isArray(layout.tabs) || !layout.tabs.length) return;
  let first = null;
  layout.tabs.forEach((spec, i) => {
    const tab = openTabFromSpec(spec, { activate: i === 0 });
    if (i === 0) first = tab;
  });
  return first;
}

export function deleteLayout(name) {
  if (!(name in savedLayouts)) return;
  delete savedLayouts[name];
  wsSend({ type: "deleteLayout", name });
}

// ---- name prompt (small modal; window.prompt is unavailable in Electron) --
let promptEl = null;
export function promptName(title, initial, onOk) {
  if (!promptEl) {
    promptEl = document.createElement("div");
    promptEl.id = "name-prompt";
    promptEl.innerHTML =
      '<div class="np-box"><div class="np-title"></div>' +
      '<input class="np-input" type="text" spellcheck="false" autocomplete="off" />' +
      '<div class="np-actions"><button class="np-cancel">Cancel</button>' +
      '<button class="np-ok">Save</button></div></div>';
    document.body.appendChild(promptEl);
  }
  const input = promptEl.querySelector(".np-input");
  const close = () => { promptEl.classList.remove("open"); };
  promptEl.querySelector(".np-title").textContent = title;
  input.value = initial || "";
  const ok = () => { const v = input.value.trim(); close(); if (v) onOk(v); };
  promptEl.querySelector(".np-ok").onclick = ok;
  promptEl.querySelector(".np-cancel").onclick = close;
  promptEl.onmousedown = (e) => { if (e.target === promptEl) close(); };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); ok(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  promptEl.classList.add("open");
  input.focus();
  input.select();
}

// Convenience used by the palette's "Save current layout…" entry.
export function saveLayoutInteractive() {
  promptName("Save layout as", "", (name) => saveCurrentLayout(name));
}
