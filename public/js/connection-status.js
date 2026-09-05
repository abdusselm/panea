

import { state } from "./state.js";

const ANNOUNCE_AFTER_MS = 800;
const RESTORED_MS = 2200;

const LABEL = {
  reconnecting: "reconnecting…",
  restored: "reconnected",
};

let el = null;
let labelEl = null;
let announceTimer = null;
let clearTimer = null;
let announced = false;

function mount() {
  if (el) return el;
  el = document.createElement("div");
  el.id = "conn-status";
  const dot = document.createElement("span");
  dot.className = "dot";
  labelEl = document.createElement("span");
  labelEl.className = "label";
  el.append(dot, labelEl);
  const list = document.getElementById("tablist");
  if (list && list.parentNode) list.parentNode.insertBefore(el, list);
  else document.body.appendChild(el);
  return el;
}

function show(kind) {
  mount();
  el.dataset.kind = kind;
  labelEl.textContent = LABEL[kind] || "";
  el.classList.add("show");
}

function hide() {
  if (el) el.classList.remove("show");
}

function setPanesLive(live) {
  document.body.classList.toggle("disconnected", !live);
  for (const p of state.panes.values()) {
    if (p.term) p.term.options.cursorBlink = live;
  }
}

function clearTimers() {
  clearTimeout(announceTimer);
  clearTimeout(clearTimer);
  announceTimer = null;
  clearTimer = null;
}

export function setConnectionState(kind) {
  clearTimers();

  if (kind === "reconnecting") {
    announceTimer = setTimeout(() => {
      announceTimer = null;
      announced = true;
      setPanesLive(false);
      show("reconnecting");
    }, ANNOUNCE_AFTER_MS);
    return;
  }

  setPanesLive(true);

  if (kind === "restored" && announced) {
    announced = false;
    show("restored");
    clearTimer = setTimeout(() => { clearTimer = null; hide(); }, RESTORED_MS);
    return;
  }

  announced = false;
  hide();
}
