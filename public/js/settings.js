// Settings panel: an overlay for editing keyboard shortcuts. Lists every
// rebindable action (from the shortcuts registry) grouped by category with its
// current chord; click a chord to capture a new key combo, with conflict and
// hint feedback. Reset one binding or all. Changes persist through the registry
// (which saves to the server). Follows the notifications/git panel pattern.

import {
  shortcutList, prettyChord, chordFromEvent,
  rebindShortcut, resetShortcut, resetAllShortcuts,
} from "./shortcuts.js";

const CATEGORY_ORDER = ["General", "Tabs", "Panes", "View"];

let panelEl = null, listEl = null;
let capturingId = null;   // action id currently awaiting a keypress
let flash = null;         // { id, msg } transient inline message
let captureHandler = null;

function ensureDom() {
  if (panelEl) return;
  panelEl = document.createElement("div");
  panelEl.id = "settings-panel";
  panelEl.innerHTML =
    '<div class="settings-box">' +
    '<div class="settings-head"><span class="settings-title">Keyboard shortcuts</span>' +
    '<span class="settings-actions"><button class="settings-reset">Reset all</button>' +
    '<button class="settings-close">Close</button></span></div>' +
    '<div class="settings-list"></div>' +
    '<div class="settings-foot">⌘1–9 switch tabs · ⌘ +/−/0 font size (fixed)</div>' +
    "</div>";
  document.body.appendChild(panelEl);
  listEl = panelEl.querySelector(".settings-list");
  panelEl.addEventListener("mousedown", (e) => { if (e.target === panelEl) close(); });
  panelEl.querySelector(".settings-close").onclick = () => close();
  panelEl.querySelector(".settings-reset").onclick = () => { resetAllShortcuts(); render(); };
}

function render() {
  if (!listEl) return;
  listEl.innerHTML = "";
  const rows = shortcutList();
  const byCat = new Map();
  for (const r of rows) { if (!byCat.has(r.category)) byCat.set(r.category, []); byCat.get(r.category).push(r); }
  const cats = [];
  for (const c of CATEGORY_ORDER) if (byCat.has(c)) cats.push([c, byCat.get(c)]);
  for (const [c, arr] of byCat) if (!CATEGORY_ORDER.includes(c)) cats.push([c, arr]);

  for (const [cat, arr] of cats) {
    const head = document.createElement("div");
    head.className = "settings-group";
    head.textContent = cat;
    listEl.appendChild(head);
    for (const r of arr) listEl.appendChild(renderRow(r));
  }
}

function renderRow(r) {
  const row = document.createElement("div");
  row.className = "settings-row";
  const capturing = capturingId === r.id;
  const flashMsg = flash && flash.id === r.id ? flash.msg : "";
  row.innerHTML =
    '<span class="sr-label"></span>' +
    (flashMsg ? '<span class="sr-flash"></span>' : "") +
    (r.custom && !capturing ? '<button class="sr-reset" title="Reset to default">reset</button>' : "") +
    '<button class="sr-chord' + (capturing ? " capturing" : "") + (r.custom ? " custom" : "") + '"></button>';
  row.querySelector(".sr-label").textContent = r.label;
  if (flashMsg) row.querySelector(".sr-flash").textContent = flashMsg;
  const chordBtn = row.querySelector(".sr-chord");
  chordBtn.textContent = capturing ? "Press keys…" : prettyChord(r.chord);
  chordBtn.onclick = () => startCapture(r.id);
  const resetBtn = row.querySelector(".sr-reset");
  if (resetBtn) resetBtn.onclick = () => { resetShortcut(r.id); render(); };
  return row;
}

// Begin listening for the next key combo to bind to `id`. A capture-phase
// keydown grabs the combo before it can trigger any existing shortcut.
function startCapture(id) {
  if (capturingId) stopCapture();
  capturingId = id;
  flash = null;
  render();
  captureHandler = (e) => {
    // Ignore lone modifier presses — wait for the actual key.
    if (["Meta", "Shift", "Alt", "Control"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") { stopCapture(); render(); return; }
    const chord = chordFromEvent(e);
    stopCapture();
    if (!chord) flash = { id, msg: "Use ⌘ + a letter" };
    else {
      const res = rebindShortcut(id, chord);
      if (!res.ok) flash = { id, msg: res.reason === "conflict" ? "Used by " + res.conflict : "Invalid" };
    }
    render();
  };
  document.addEventListener("keydown", captureHandler, true);
}

function stopCapture() {
  if (captureHandler) { document.removeEventListener("keydown", captureHandler, true); captureHandler = null; }
  capturingId = null;
}

// ---- open / close ---------------------------------------------------------

export function isSettingsOpen() { return panelEl && panelEl.classList.contains("open"); }

// Re-render if open when settings arrive/change over the socket.
export function refreshOpenSettings() { if (isSettingsOpen()) render(); }

export function openSettings() {
  ensureDom();
  flash = null;
  panelEl.classList.add("open");
  render();
}

function close() {
  stopCapture();
  flash = null;
  if (panelEl) panelEl.classList.remove("open");
}
export function closeSettings() { close(); }
export function toggleSettings() { isSettingsOpen() ? close() : openSettings(); }
