// Tabs: lifecycle (create / activate / close), sidebar list rendering with live
// git/cwd/port metadata, the right-click menu, auto-titling, and inline rename.

import { state, runtime } from "./state.js";
import { workspace, tablistEl, emptyEl } from "./dom.js";
import { ICON } from "./theme.js";
import { uid, countLeaves, firstLeaf, eachLeaf, shortPath, cleanTitle } from "./util.js";
import { createPane, renderTab, focusPane, destroyPane, refitTab } from "./panes.js";
import { persist } from "./session.js";

// ---- lifecycle -----------------------------------------------------------
export function newTab(cwd) {
  const paneId = uid();
  const tab = { id: uid(), name: "shell", cwd: cwd || null, tree: { kind: "leaf", id: paneId } };
  state.tabs.push(tab);
  createTabPaneEl(tab);
  createPane(paneId, tab.id, tab.cwd);
  renderTab(tab);
  activateTab(tab.id);
  renderTabList();
  persist();
}

export function createTabPaneEl(tab) {
  const el = document.createElement("div");
  el.className = "tabpane";
  el.dataset.tabId = tab.id;
  workspace.appendChild(el);
  tab.el = el;
}

export function activateTab(tabId) {
  state.activeTabId = tabId;
  for (const t of state.tabs) t.el.classList.toggle("active", t.id === tabId);
  const tab = state.tabs.find((t) => t.id === tabId);
  if (tab) {
    tab.attention = false;
    const first = firstLeaf(tab.tree);
    if (first) focusPane(first.id);
    refitTab(tab);
  }
  emptyEl.style.display = state.tabs.length ? "none" : "flex";
  refreshTabClasses();
  persist();
}

export function closeTab(tabId) {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return;
  const tab = state.tabs[idx];
  eachLeaf(tab.tree, (leaf) => destroyPane(leaf.id));
  tab.el.remove();
  state.tabs.splice(idx, 1);
  if (state.activeTabId === tabId) {
    const next = state.tabs[idx] || state.tabs[idx - 1];
    if (next) activateTab(next.id);
    else { state.activeTabId = null; emptyEl.style.display = "flex"; }
  }
  renderTabList();
  persist();
}

// ---- sidebar list --------------------------------------------------------
export function renderTabList() {
  tablistEl.innerHTML = "";
  state.tabs.forEach((tab, i) => {
    const row = document.createElement("div");
    row.dataset.tabId = tab.id;
    const attn = countPaneAttention(tab);
    row.className = "tab" + (tab.id === state.activeTabId ? " active" : "") + (attn > 0 ? " attention" : "");
    row.innerHTML = `
      <span class="badge">${i + 1}</span>
      <div class="tabtext"><div class="name"></div><div class="sub"></div><div class="ports"></div></div>
      <span class="attn-count">${attn > 0 ? attn : ""}</span>
      <span class="close">${ICON.close}</span>`;
    const nameEl = row.querySelector(".name");
    nameEl.textContent = tab.name;
    nameEl.title = "Double-click to rename";
    fillTabMeta(row, tab);
    // Single click activates via class update only (no full rebuild), so the
    // dblclick that follows still lands on this same node.
    row.onclick = (e) => { if (!e.target.closest(".close")) activateTab(tab.id); };
    nameEl.ondblclick = (e) => { e.stopPropagation(); startRename(tab, nameEl); };
    row.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showTabMenu(tab, e.clientX, e.clientY); };
    row.querySelector(".close").onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
    tablistEl.appendChild(row);
  });
}

// Update only active/attention classes on existing rows (avoids rebuilding the
// list on every click, which would break dblclick-to-rename).
export function refreshTabClasses() {
  [...tablistEl.children].forEach((row) => {
    const t = state.tabs.find((x) => x.id === row.dataset.tabId);
    if (!t) return;
    row.classList.toggle("active", t.id === state.activeTabId);
    const n = countPaneAttention(t);
    row.classList.toggle("attention", n > 0);
    const badge = row.querySelector(".attn-count");
    if (badge) badge.textContent = n > 0 ? String(n) : "";
  });
}

export function countPaneAttention(tab) {
  let n = 0;
  eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (q && q.attention) n++; });
  return n;
}

// ---- per-tab metadata rows (git branch / cwd / listening ports) ----------
// The metadata shown for a tab comes from its naming pane: the focused pane if
// it's in this tab, else the first pane.
function tabMeta(tab) {
  const p = namingPane(tab);
  return (p && p.meta) || { cwd: tab.cwd || "", branch: "", ports: [] };
}

// Aggregate listening ports across every pane in the tab (a dev server may run
// in a different split than the naming pane).
function tabPorts(tab) {
  const set = new Set();
  eachLeaf(tab.tree, (l) => {
    const q = state.panes.get(l.id);
    if (q && q.meta && q.meta.ports) for (const p of q.meta.ports) set.add(p);
  });
  return [...set].sort((a, b) => a - b);
}

function fillTabMeta(row, tab) {
  const meta = tabMeta(tab);
  const subEl = row.querySelector(".sub");
  const portsEl = row.querySelector(".ports");
  if (!subEl || !portsEl) return;
  subEl.innerHTML = "";
  const dir = shortPath(meta.cwd || tab.cwd);
  if (meta.branch) {
    const b = document.createElement("span");
    b.className = "branch";
    b.textContent = "⑂ " + meta.branch;
    subEl.appendChild(b);
    subEl.appendChild(document.createTextNode(" · "));
  }
  subEl.appendChild(document.createTextNode(dir));
  const paneCount = countLeaves(tab.tree);
  if (paneCount > 1) subEl.appendChild(document.createTextNode(` · ${paneCount} panes`));
  portsEl.innerHTML = "";
  const ports = tabPorts(tab);
  for (const p of ports.slice(0, 4)) {
    const pill = document.createElement("span");
    pill.className = "port";
    pill.textContent = ":" + p;
    portsEl.appendChild(pill);
  }
  portsEl.style.display = ports.length ? "flex" : "none";
}

// Update just the meta of an already-rendered row (no full rebuild, so an open
// rename input survives).
export function refreshTabMeta(tab) {
  if (runtime.renaming) return;
  const row = [...tablistEl.children].find((r) => r.dataset.tabId === tab.id);
  if (row) fillTabMeta(row, tab);
}

// ---- right-click menu ----------------------------------------------------
let ctxMenuEl = null;
function closeTabMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; document.removeEventListener("mousedown", onCtxDocDown, true); }
}
function onCtxDocDown(e) { if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeTabMenu(); }
function showTabMenu(tab, x, y) {
  closeTabMenu();
  const m = document.createElement("div");
  m.className = "ctx-menu";
  m.innerHTML = `<button data-a="rename">Rename</button><button data-a="close">Close terminal</button>`;
  document.body.appendChild(m);
  m.style.left = Math.min(x, window.innerWidth - 160) + "px";
  m.style.top = y + "px";
  m.querySelector('[data-a="rename"]').onclick = () => {
    closeTabMenu();
    const row = [...tablistEl.children].find((r) => r.dataset.tabId === tab.id);
    if (row) startRename(tab, row.querySelector(".name"));
  };
  m.querySelector('[data-a="close"]').onclick = () => { closeTabMenu(); closeTab(tab.id); };
  ctxMenuEl = m;
  setTimeout(() => document.addEventListener("mousedown", onCtxDocDown, true), 0);
}

// ---- auto-titling --------------------------------------------------------
export function setPaneTitle(paneId, raw) {
  const p = state.panes.get(paneId);
  if (!p) return;
  p.title = cleanTitle(raw);
  if (p.titleEl) p.titleEl.textContent = p.title;
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) updateTabName(tab);
}

// The pane whose title names the tab: the focused pane if it is in this tab,
// otherwise the tab's first pane.
function namingPane(tab) {
  const f = state.focusedPaneId && state.panes.get(state.focusedPaneId);
  if (f && f.tabId === tab.id) return f;
  const leaf = firstLeaf(tab.tree);
  return leaf && state.panes.get(leaf.id);
}

export function updateTabName(tab) {
  if (tab.customName) return; // user renamed it; leave it alone
  if (runtime.renaming) return;
  const p = namingPane(tab);
  const name = (p && p.title) || "shell";
  if (name !== tab.name) { tab.name = name; renderTabList(); persist(); }
}

// ---- inline rename -------------------------------------------------------
// Swap the name label for an input. Empty value re-enables the automatic
// (title-driven) name.
export function startRename(tab, nameEl) {
  runtime.renaming = true;
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = tab.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (save) => {
    if (done) return; done = true;
    runtime.renaming = false;
    if (save) {
      const v = input.value.trim();
      if (v) { tab.name = v; tab.customName = true; }
      else { tab.customName = false; updateTabName(tab); }
    }
    renderTabList();
    persist();
  };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); commit(true); }
    else if (e.key === "Escape") { e.preventDefault(); commit(false); }
  };
  input.onblur = () => commit(true);
  input.onclick = (e) => e.stopPropagation();
}
