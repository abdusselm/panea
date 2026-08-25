

import { state } from "./state.js";
import { swapLeaves, moveLeaf } from "./pane-tree.js";
import { renderTab, refitTab, focusPane } from "./panes.js";
import { persist } from "./session.js";

const EDGE = 0.26;

let dragPaneId = null;
let overlayEl = null;

function overlay() {
  if (!overlayEl) {
    overlayEl = document.createElement("div");
    overlayEl.className = "pane-drop";
  }
  return overlayEl;
}

function clearOverlay() {
  if (overlayEl && overlayEl.parentNode) overlayEl.remove();
}

function showOverlay(paneEl, side) {
  const el = overlay();
  el.className = "pane-drop " + side;
  if (el.parentNode !== paneEl) paneEl.appendChild(el);
}

function sideFor(paneEl, x, y) {
  const r = paneEl.getBoundingClientRect();
  if (!r.width || !r.height) return "center";
  const left = (x - r.left) / r.width;
  const top = (y - r.top) / r.height;
  const edges = [["left", left], ["right", 1 - left], ["top", top], ["bottom", 1 - top]];
  let best = edges[0];
  for (const e of edges) if (e[1] < best[1]) best = e;
  return best[1] > EDGE ? "center" : best[0];
}

function endDrag() {
  const src = dragPaneId && state.panes.get(dragPaneId);
  if (src) src.el.classList.remove("drag-source");
  dragPaneId = null;
  document.body.classList.remove("arranging-panes");
  clearOverlay();
}

function applyDrop(target, side, dragId) {
  const drag = state.panes.get(dragId);
  if (!drag || drag === target || drag.tabId !== target.tabId) return;
  const tab = state.tabs.find((t) => t.id === drag.tabId);
  if (!tab) return;
  tab.tree = side === "center"
    ? swapLeaves(tab.tree, drag.id, target.id)
    : moveLeaf(tab.tree, drag.id, target.id, side);
  renderTab(tab);
  focusPane(drag.id);
  refitTab(tab);
  persist();
}

function droppable(target) {
  const drag = dragPaneId && state.panes.get(dragPaneId);
  return !!drag && drag !== target && drag.tabId === target.tabId;
}

export function wirePaneArrange(pane) {
  const bar = pane.el.querySelector(".leaf-bar");

  bar.draggable = true;
  bar.addEventListener("dragstart", (e) => {
    if (e.target.closest("button") || e.target.closest("input")) { e.preventDefault(); return; }
    dragPaneId = pane.id;
    pane.el.classList.add("drag-source");
    document.body.classList.add("arranging-panes");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", pane.id); } catch (_) {}
  });
  bar.addEventListener("dragend", endDrag);

  pane.el.addEventListener("dragover", (e) => {
    if (!droppable(pane)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    showOverlay(pane.el, sideFor(pane.el, e.clientX, e.clientY));
  });
  pane.el.addEventListener("dragleave", (e) => {
    if (pane.el.contains(e.relatedTarget)) return;
    if (overlayEl && overlayEl.parentNode === pane.el) clearOverlay();
  });
  pane.el.addEventListener("drop", (e) => {
    if (!droppable(pane)) return;
    e.preventDefault();
    e.stopPropagation();
    const side = sideFor(pane.el, e.clientX, e.clientY);
    const dragId = dragPaneId;
    endDrag();
    applyDrop(pane, side, dragId);
  });
}

export function setPaneDraggable(pane, on) {
  const bar = pane.el.querySelector(".leaf-bar");
  if (bar) bar.draggable = !!on;
}
