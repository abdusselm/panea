

import { state, runtime } from "./state.js";
import { workspace, tablistEl, emptyEl } from "./dom.js";
import { ICON } from "./theme.js";
import { uid, countLeaves, firstLeaf, eachLeaf, shortPath, cleanTitle } from "./util.js";
import { createPane, renderTab, focusPane, destroyPane, refitTab } from "./panes.js";
import { persist } from "./session.js";
import { recordClosedTab } from "./layouts.js";
import { paneLabel } from "./pane-identity.js";
import { countHiddenPanes } from "./pane-visibility.js";
import { createBrowserPane } from "./browser-pane.js";

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
  recordClosedTab(serializeTab(tab));
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

export function serializeTab(tab) {
  return { name: tab.name, cwd: tab.cwd, tree: structuredClone(tab.tree), customName: !!tab.customName };
}

function remapTreeIds(node) {
  if (!node || node.kind === "leaf") {
    const leaf = { kind: "leaf", id: uid() };
    if (node && node.name) leaf.name = node.name;
    if (node && node.color) leaf.color = node.color;
    if (node && node.hidden) leaf.hidden = true;
    return leaf;
  }
  return { kind: "split", dir: node.dir, ratio: node.ratio, children: [remapTreeIds(node.children[0]), remapTreeIds(node.children[1])] };
}

export function instantiateTree(tab, node) {
  if (!node) return;
  if (node.kind === "leaf") {
    const restore = (node.agent || node.scroll || node.name || node.color || node.hidden)
      ? { agent: node.agent || "", scroll: node.scroll || "", name: node.name || "", color: node.color || "", hidden: !!node.hidden }
      : undefined;
    if (node.paneKind === "browser") createBrowserPane(node.id, tab.id, node.url || "", restore);
    else createPane(node.id, tab.id, node.cwd || tab.cwd, restore);
  } else {
    instantiateTree(tab, node.children[0]);
    instantiateTree(tab, node.children[1]);
  }
}

export function openTabFromSpec(spec, { activate = true } = {}) {
  const tab = {
    id: uid(),
    name: spec.name || "shell",
    cwd: spec.cwd || null,
    tree: remapTreeIds(spec.tree),
    customName: !!spec.customName,
  };
  state.tabs.push(tab);
  createTabPaneEl(tab);
  instantiateTree(tab, tab.tree);
  renderTab(tab);
  if (activate) activateTab(tab.id);
  renderTabList();
  persist();
  return tab;
}

export function renderTabList() {
  tablistEl.innerHTML = "";
  state.tabs.forEach((tab, i) => {
    const row = document.createElement("div");
    row.dataset.tabId = tab.id;
    const attn = countPaneAttention(tab);
    row.className = "tab" + (tab.id === state.activeTabId ? " active" : "") + (attn > 0 ? " attention" : "");
    row.innerHTML = `
      <span class="badge">${i + 1}</span>
      <div class="tabtext"><div class="name"></div><div class="prompt"></div><div class="sub"></div><div class="ports"></div></div>
      <span class="attn-count">${attn > 0 ? attn : ""}</span>
      <span class="close">${ICON.close}</span>`;
    const nameEl = row.querySelector(".name");
    nameEl.textContent = tab.name;
    nameEl.title = "Double-click to rename";
    fillTabMeta(row, tab);

    row.onclick = (e) => { if (!e.target.closest(".close")) activateTab(tab.id); };
    nameEl.ondblclick = (e) => { e.stopPropagation(); startRename(tab, nameEl); };
    row.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showTabMenu(tab, e.clientX, e.clientY); };
    row.querySelector(".close").onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
    wireTabDrag(row, tab);
    tablistEl.appendChild(row);
  });
}

let dragTabId = null;

function clearDropMarks() {
  for (const r of tablistEl.children) r.classList.remove("drop-before", "drop-after");
}

function isAfter(row, clientY) {
  const r = row.getBoundingClientRect();
  return clientY > r.top + r.height / 2;
}

function wireTabDrag(row, tab) {
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    dragTabId = tab.id;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", tab.id); } catch (_) {}
  });
  row.addEventListener("dragend", () => { dragTabId = null; row.classList.remove("dragging"); clearDropMarks(); });
  row.addEventListener("dragover", (e) => {
    if (dragTabId == null || dragTabId === tab.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropMarks();
    row.classList.add(isAfter(row, e.clientY) ? "drop-after" : "drop-before");
  });
  row.addEventListener("drop", (e) => {
    if (dragTabId == null || dragTabId === tab.id) return;
    e.preventDefault();
    reorderTabs(dragTabId, tab.id, isAfter(row, e.clientY));
  });
}

function reorderTabs(fromId, toId, after) {
  const from = state.tabs.findIndex((t) => t.id === fromId);
  if (from < 0) return;
  const [moved] = state.tabs.splice(from, 1);
  let to = state.tabs.findIndex((t) => t.id === toId);
  if (to < 0) { state.tabs.splice(from, 0, moved); return; }
  if (after) to += 1;
  state.tabs.splice(to, 0, moved);
  renderTabList();
  persist();
}

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

function tabMeta(tab) {
  const p = namingPane(tab);
  return (p && p.meta) || { cwd: tab.cwd || "", branch: "", ports: [] };
}

function tabPorts(tab) {
  const set = new Set();
  eachLeaf(tab.tree, (l) => {
    const q = state.panes.get(l.id);
    if (q && q.meta && q.meta.ports) for (const p of q.meta.ports) set.add(p);
  });
  return [...set].sort((a, b) => a - b);
}

function tabPrompt(tab) {
  let out = "";
  eachLeaf(tab.tree, (l) => {
    if (out) return;
    const q = state.panes.get(l.id);
    if (q && q.lastPrompt) out = q.lastPrompt;
  });
  return out;
}

function fillTabMeta(row, tab) {
  const meta = tabMeta(tab);
  const promptEl = row.querySelector(".prompt");
  if (promptEl) {
    const pr = tabPrompt(tab);
    promptEl.textContent = pr;
    promptEl.style.display = pr ? "block" : "none";
  }
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
  const hiddenCount = countHiddenPanes(tab);
  if (hiddenCount) {
    const h = document.createElement("span");
    h.className = "hidden-count";
    h.textContent = `${hiddenCount} hidden`;
    subEl.appendChild(h);
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

export function refreshTabMeta(tab) {
  if (runtime.renaming) return;
  const row = [...tablistEl.children].find((r) => r.dataset.tabId === tab.id);
  if (row) fillTabMeta(row, tab);
}

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

export function setPaneTitle(paneId, raw) {
  const p = state.panes.get(paneId);
  if (!p) return;
  p.title = cleanTitle(raw);
  if (p.titleEl && !p.customTitle && !p.renaming) p.titleEl.textContent = p.title;
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) updateTabName(tab);
}

function namingPane(tab) {
  const f = state.focusedPaneId && state.panes.get(state.focusedPaneId);
  if (f && f.tabId === tab.id) return f;
  const leaf = firstLeaf(tab.tree);
  return leaf && state.panes.get(leaf.id);
}

export function updateTabName(tab) {
  if (tab.customName) return;
  if (runtime.renaming) return;
  const p = namingPane(tab);
  const name = paneLabel(p);

  if (name !== tab.name) { tab.name = name; refreshTabName(tab); persist(); }
}

function refreshTabName(tab) {
  if (runtime.renaming) return;
  const row = [...tablistEl.children].find((r) => r.dataset.tabId === tab.id);
  if (!row) return;
  const n = row.querySelector(".name");
  if (n) n.textContent = tab.name;
}

export function startRename(tab, nameEl) {
  runtime.renaming = true;
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = tab.name;
  nameEl.replaceWith(input);

  const row = input.closest && input.closest(".tab");
  if (row) row.draggable = false;
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
