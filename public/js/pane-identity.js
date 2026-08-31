

import { state } from "./state.js";
import { updateTabName, refreshTabMeta } from "./tabs.js";
import { closePane } from "./panes.js";
import { persist } from "./session.js";
import { setPaneDraggable } from "./pane-arrange.js";
import { togglePaneHidden } from "./pane-visibility.js";

export const PANE_COLORS = [
  { id: "red", label: "Red", hex: "#cc6666" },
  { id: "orange", label: "Orange", hex: "#de935f" },
  { id: "yellow", label: "Yellow", hex: "#f0c674" },
  { id: "green", label: "Green", hex: "#b5bd68" },
  { id: "cyan", label: "Cyan", hex: "#8abeb7" },
  { id: "blue", label: "Blue", hex: "#81a2be" },
  { id: "purple", label: "Purple", hex: "#b294bb" },
];

const colorHex = (id) => (PANE_COLORS.find((c) => c.id === id) || {}).hex || "";

export function paneLabel(p) {
  return (p && (p.customTitle || p.title)) || "shell";
}

export function refreshPaneLabel(p) {
  if (p && p.titleEl) p.titleEl.textContent = paneLabel(p);
}

export function setPaneName(p, name) {
  if (!p) return;
  p.customTitle = (name || "").trim().slice(0, 60);
  refreshPaneLabel(p);
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { updateTabName(tab); refreshTabMeta(tab); }
}

export function setPaneColor(p, color) {
  if (!p) return;
  const hex = colorHex(color);
  p.color = hex ? color : "";
  p.el.classList.toggle("tinted", !!hex);
  if (hex) p.el.style.setProperty("--pane-color", hex);
  else p.el.style.removeProperty("--pane-color");
}

export function applyPaneIdentity(p, restore) {
  if (!p || !restore) return;
  if (restore.name) setPaneName(p, restore.name);
  if (restore.color) setPaneColor(p, restore.color);
}

export function startPaneRename(p) {
  if (!p || !p.titleEl || p.renaming) return;
  p.renaming = true;
  const titleEl = p.titleEl;
  const input = document.createElement("input");
  input.className = "pane-rename-input";
  input.value = paneLabel(p);
  titleEl.replaceWith(input);
  setPaneDraggable(p, false);
  input.focus();
  input.select();

  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    p.renaming = false;
    const value = input.value;
    input.replaceWith(titleEl);
    setPaneDraggable(p, true);
    if (save) { setPaneName(p, value); persist(); }
    else refreshPaneLabel(p);
    p.term.focus();
  };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); commit(true); }
    else if (e.key === "Escape") { e.preventDefault(); commit(false); }
  };
  input.onblur = () => commit(true);
  input.onmousedown = (e) => e.stopPropagation();
}

let menuEl = null;

function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener("mousedown", onDocDown, true);
}
function onDocDown(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }

export function openPaneMenu(p, x, y) {
  closeMenu();
  const m = document.createElement("div");
  m.className = "ctx-menu pane-menu";
  m.innerHTML = `
    <button data-a="rename">Rename pane</button>
    <button data-a="hide">${p.hidden ? "Reveal pane" : "Hide pane"}</button>
    <div class="pane-swatches"></div>
    <button data-a="close">Close pane</button>`;
  const swatches = m.querySelector(".pane-swatches");
  for (const c of PANE_COLORS) {
    const b = document.createElement("button");
    b.className = "swatch" + (p.color === c.id ? " on" : "");
    b.style.setProperty("--sw", c.hex);
    b.title = c.label;
    b.onclick = () => { closeMenu(); setPaneColor(p, p.color === c.id ? "" : c.id); persist(); };
    swatches.appendChild(b);
  }
  const clear = document.createElement("button");
  clear.className = "swatch none" + (p.color ? "" : " on");
  clear.title = "No color";
  clear.onclick = () => { closeMenu(); setPaneColor(p, ""); persist(); };
  swatches.appendChild(clear);

  document.body.appendChild(m);
  m.style.left = Math.min(x, window.innerWidth - m.offsetWidth - 8) + "px";
  m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 8) + "px";
  m.querySelector('[data-a="rename"]').onclick = () => { closeMenu(); startPaneRename(p); };
  m.querySelector('[data-a="hide"]').onclick = () => { closeMenu(); togglePaneHidden(p.id); };
  m.querySelector('[data-a="close"]').onclick = () => { closeMenu(); closePane(p.id); };
  menuEl = m;
  setTimeout(() => document.addEventListener("mousedown", onDocDown, true), 0);
}

export function openPaneMenuForPane(p) {
  if (!p) return;
  const bar = p.el.querySelector(".leaf-bar");
  const r = (bar || p.el).getBoundingClientRect();
  openPaneMenu(p, r.left + 12, r.bottom + 4);
}

export function wirePaneIdentity(p) {
  const bar = p.el.querySelector(".leaf-bar");
  p.titleEl.title = "Double-click to rename";
  p.titleEl.ondblclick = (e) => { e.stopPropagation(); startPaneRename(p); };
  bar.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); openPaneMenu(p, e.clientX, e.clientY); };
}
