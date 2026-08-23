

import { state } from "./state.js";
import { openTabFromSpec, serializeTab } from "./tabs.js";
import { wsSend } from "./ws.js";

const CLOSED_CAP = 15;
const closedStack = [];

export function recordClosedTab(spec) {
  closedStack.push(spec);
  if (closedStack.length > CLOSED_CAP) closedStack.shift();
}

export function hasClosedTabs() { return closedStack.length > 0; }

export function reopenClosedTab() {
  const spec = closedStack.pop();
  if (spec) openTabFromSpec(spec);
}

let savedLayouts = {};

export function setLayouts(map) {
  savedLayouts = map && typeof map === "object" ? map : {};
}

export function layoutNames() {
  return Object.keys(savedLayouts).sort((a, b) => a.localeCompare(b));
}

function serializeWorkspace() {
  const active = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  return { tabs: active ? [serializeTab(active)] : [] };
}

export function saveCurrentLayout(name) {
  const clean = (name || "").trim();
  if (!clean || !state.tabs.length) return;
  const layout = serializeWorkspace();
  savedLayouts[clean] = layout;
  wsSend({ type: "saveLayout", name: clean, layout });
}

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

export function deleteLayoutInteractive(name) {
  if (!(name in savedLayouts)) return;
  confirmAction("Delete layout", "Delete saved layout <b></b>? This can't be undone.",
    name, "Delete", () => deleteLayout(name));
}

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

export function saveLayoutInteractive() {
  promptName("Save this tab as layout", "", (name) => saveCurrentLayout(name));
}

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
  msg.innerHTML = messageHtml;
  const slot = msg.querySelector("b");
  if (slot) slot.textContent = boldText;
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
