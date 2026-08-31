

import { state } from "./state.js";
import { eachLeaf, findLeaf } from "./util.js";
import { ICON } from "./theme.js";
import { renderTab, refitTab, focusPane } from "./panes.js";
import { refreshTabMeta } from "./tabs.js";
import { setPaneDraggable } from "./pane-arrange.js";
import { railLayout } from "./pane-rail.js";
import { persist } from "./session.js";

export function isPaneHidden(p) { return !!(p && p.hidden); }

function tabOf(p) { return state.tabs.find((t) => t.id === p.tabId); }

export function countHiddenPanes(tab) {
  let n = 0;
  eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (q && q.hidden) n++; });
  return n;
}

function visiblePaneCount(tab) {
  let n = 0;
  eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (q && !q.hidden) n++; });
  return n;
}

function firstVisiblePane(tab) {
  let hit = null;
  eachLeaf(tab.tree, (l) => {
    if (hit) return;
    const q = state.panes.get(l.id);
    if (q && !q.hidden) hit = q;
  });
  return hit;
}

export function firstVisiblePaneId(tabId) {
  const tab = state.tabs.find((t) => t.id === tabId);
  const p = tab && firstVisiblePane(tab);
  return p ? p.id : "";
}

export function ensureVisiblePane(tab) {
  if (!tab || visiblePaneCount(tab)) return;
  eachLeaf(tab.tree, (l) => {
    const q = state.panes.get(l.id);
    if (q && q.hidden) markHidden(q, false);
  });
}

function markHidden(p, on) {
  p.hidden = on;
  p.el.classList.toggle("hidden-pane", on);
  if (!on) {
    p.el.classList.remove("rail-col", "rail-row");
    try { p.term.resize(Math.max(2, p.term.cols - 1), p.term.rows); } catch (_) {}
  }
  setPaneDraggable(p, !on);
  const btn = p.el.querySelector('[data-act="hide"]');
  if (btn) {
    btn.innerHTML = on ? ICON.eye : ICON.eyeOff;
    btn.title = on ? "Reveal pane" : "Hide pane (keeps it running)";
  }
}

export function hidePane(paneId) {
  const p = state.panes.get(paneId);
  if (!p || p.hidden) return;
  const tab = tabOf(p);
  if (!tab) return;
  const found = findLeaf(tab.tree, paneId, null);
  if (!found || !found.parent) return;
  if (visiblePaneCount(tab) < 2) return;
  markHidden(p, true);
  renderTab(tab);
  if (state.focusedPaneId === paneId) {
    const next = firstVisiblePane(tab);
    if (next) focusPane(next.id);
  }
  refitTab(tab);
  refreshTabMeta(tab);
  persist();
}

export function showPane(paneId) {
  const p = state.panes.get(paneId);
  if (!p || !p.hidden) return;
  const tab = tabOf(p);
  markHidden(p, false);
  if (tab) { renderTab(tab); refitTab(tab); refreshTabMeta(tab); }
  focusPane(paneId);
  persist();
}

export function togglePaneHidden(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  if (p.hidden) showPane(paneId);
  else hidePane(paneId);
}

export function revealAllPanes(tab) {
  if (!tab || !countHiddenPanes(tab)) return;
  eachLeaf(tab.tree, (l) => {
    const q = state.panes.get(l.id);
    if (q && q.hidden) markHidden(q, false);
  });
  renderTab(tab);
  refitTab(tab);
  refreshTabMeta(tab);
  persist();
}

export function applyPaneHidden(p, restore) {
  if (p && restore && restore.hidden) markHidden(p, true);
}

export function wirePaneVisibility(p) {
  const btn = p.el.querySelector('[data-act="hide"]');
  if (btn) btn.onclick = (e) => { e.stopPropagation(); togglePaneHidden(p.id); };
  p.el.addEventListener("click", (e) => {
    if (!p.hidden || e.target.closest("button")) return;
    e.stopPropagation();
    showPane(p.id);
  });
}

function isRail(el) {
  return !!el && (el.classList.contains("hidden-pane") || el.classList.contains("rail-pack"));
}

function setRail(el, dir) {
  el.classList.toggle("rail-col", dir === "h");
  el.classList.toggle("rail-row", dir === "v");
}

function setShare(el, grow) {
  el.style.flexGrow = String(grow);
  el.style.flexBasis = grow ? "0" : "auto";
}

export function syncSplitLayout(node, split, gutter, a, b) {
  const ar = isRail(a);
  const br = isRail(b);
  const layout = railLayout(node.ratio, ar, br);
  setRail(a, ar ? node.dir : "");
  setRail(b, br ? node.dir : "");
  setShare(a, layout.first);
  setShare(b, layout.second);
  gutter.classList.toggle("locked", layout.locked);
  split.classList.toggle("rail-pack", layout.packed);
}
