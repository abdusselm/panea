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

// Delete behind a confirmation step; the palette entry uses this so a stray
// Enter can't wipe a saved layout.
export function deleteLayoutInteractive(name) {
  if (!(name in savedLayouts)) return;
  confirmAction("Delete layout", "Delete saved layout <b></b>? This can't be undone.",
    name, "Delete", () => deleteLayout(name));
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

// ---- confirm modal (destructive actions) ---------------------------------
let confirmEl = null;
function confirmAction(title, messageHtml, boldText, okLabel, onOk) {
  if (!confirmEl) {
    confirmEl = document.createElement("div");
    confirmEl.id = "confirm-modal";
    confirmEl.innerHTML =
      '<div class="np-box"><div class="np-title"></div>' +
      '<div class="np-msg"></div>' +
      '<div class="np-actions"><button class="np-cancel">Cancel</button>' +
      '<button class="np-danger"></button></div></div>';
    document.body.appendChild(confirmEl);
  }
  const msg = confirmEl.querySelector(".np-msg");
  msg.innerHTML = messageHtml;         // trusted template with a <b></b> slot
  const slot = msg.querySelector("b");
  if (slot) slot.textContent = boldText; // name inserted as text, never HTML
  confirmEl.querySelector(".np-title").textContent = title;
  const okBtn = confirmEl.querySelector(".np-danger");
  okBtn.textContent = okLabel || "OK";
  const close = () => { confirmEl.classList.remove("open"); };
  const ok = () => { close(); onOk(); };
  okBtn.onclick = ok;
  confirmEl.querySelector(".np-cancel").onclick = close;
  confirmEl.onmousedown = (e) => { if (e.target === confirmEl) close(); };
  confirmEl.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); ok(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  confirmEl.classList.add("open");
  confirmEl.tabIndex = -1;
  confirmEl.focus();
}

// ---- layout picker (choose one saved layout) -----------------------------
// One palette entry ("Open layout…" / "Delete layout…") opens this list of
// saved layouts instead of spamming the palette with one row per layout.
let pickerEl = null, pickerNames = [], pickerIdx = 0, pickerOnPick = null;

function renderPicker() {
  const list = pickerEl.querySelector(".lp-list");
  list.innerHTML = "";
  pickerNames.forEach((name, i) => {
    const row = document.createElement("div");
    row.className = "lp-item" + (i === pickerIdx ? " sel" : "");
    row.textContent = name;
    row.onmousemove = () => setPickerIdx(i);
    row.onclick = () => choosePicker(i);
    list.appendChild(row);
  });
}
function setPickerIdx(i) {
  pickerIdx = i;
  [...pickerEl.querySelectorAll(".lp-item")].forEach((el, j) => el.classList.toggle("sel", j === i));
}
function movePicker(delta) {
  if (!pickerNames.length) return;
  setPickerIdx((pickerIdx + delta + pickerNames.length) % pickerNames.length);
  const el = pickerEl.querySelectorAll(".lp-item")[pickerIdx];
  if (el) el.scrollIntoView({ block: "nearest" });
}
function closePicker() { if (pickerEl) pickerEl.classList.remove("open"); }
function choosePicker(i) {
  const name = pickerNames[i];
  closePicker();
  if (name && pickerOnPick) pickerOnPick(name);
}

function pickLayout(title, onPick) {
  pickerNames = layoutNames();
  if (!pickerNames.length) return;
  if (!pickerEl) {
    pickerEl = document.createElement("div");
    pickerEl.id = "layout-picker";
    pickerEl.innerHTML =
      '<div class="np-box"><div class="np-title"></div><div class="lp-list"></div></div>';
    document.body.appendChild(pickerEl);
    pickerEl.onmousedown = (e) => { if (e.target === pickerEl) closePicker(); };
    pickerEl.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "ArrowDown") { e.preventDefault(); movePicker(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); movePicker(-1); }
      else if (e.key === "Enter") { e.preventDefault(); choosePicker(pickerIdx); }
      else if (e.key === "Escape") { e.preventDefault(); closePicker(); }
    };
  }
  pickerEl.querySelector(".np-title").textContent = title;
  pickerOnPick = onPick;
  pickerIdx = 0;
  renderPicker();
  pickerEl.classList.add("open");
  pickerEl.tabIndex = -1;
  pickerEl.focus();
}

export function openLayoutInteractive() { pickLayout("Open layout", openLayout); }
export function deleteLayoutPick() { pickLayout("Delete layout", deleteLayoutInteractive); }
