"use strict";
// panea frontend: vertical tabs, split panes, attention rings, session restore.

const { Terminal } = window;
const FitAddon = window.FitAddon;

// cmux palette (Tomorrow-Night ANSI set, taken from the cmux source), on the
// cmux app background (#0a0a0a).
// Terminal background: dark neutral grey (not pure black), matching cmux's
// ghostty-derived look. Keep this in sync with --term-bg in style.css.
const TERM_THEME = {
  background: "#282c34",
  foreground: "#c5c8c6",
  cursor: "#87afd7",
  selectionBackground: "#3a3a3a",
  black: "#1d1f21", brightBlack: "#666666",
  red: "#cc6666", brightRed: "#d54e53",
  green: "#b5bd68", brightGreen: "#b9ca4a",
  yellow: "#f0c674", brightYellow: "#e7c547",
  blue: "#81a2be", brightBlue: "#7aa6da",
  magenta: "#b294bb", brightMagenta: "#c397d8",
  cyan: "#8abeb7", brightCyan: "#70c0b1",
  white: "#c5c8c6", brightWhite: "#eaeaea",
};

// ---- terminal font (tuned for long coding sessions) ----------------------
// SF Mono (Apple's coding font, preinstalled) first; JetBrains Mono / Fira Code
// used if the developer has them; Menlo as the safe fallback. A roomier line
// height reduces eye strain over long sessions. Size is live-adjustable.
const FONT_FAMILY = '"SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace';
const FONT_LINE_HEIGHT = 1.3;
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 24;
let fontSize = DEFAULT_FONT_SIZE;

// ---- inline SVG icons (crisp, cmux-like, no external assets) --------------
const ICON = {
  folder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h5.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>',
  splitH: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="8" y1="2.5" x2="8" y2="13.5"/></svg>',
  splitV: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="1.5" y1="8" x2="14.5" y2="8"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>',
};

// ---- base64 helpers (binary-safe over JSON) ------------------------------
const enc = new TextEncoder();
function u8ToB64(u8) { let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
function b64ToU8(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

// ---- state ---------------------------------------------------------------
const state = {
  tabs: [],          // {id, name, cwd, tree, el, attention}
  activeTabId: null,
  panes: new Map(),  // paneId -> {term, fit, tabId, cwd, exited, el, termEl, ro}
  focusedPaneId: null,
};
let ws = null;
let wsReady = false;
let renaming = false;
let windowFocused = typeof document !== "undefined" ? document.hasFocus() : true;
const pendingOpens = [];

const workspace = document.getElementById("workspace");
const tablistEl = document.getElementById("tablist");
const emptyEl = document.getElementById("empty");

// ---- websocket -----------------------------------------------------------
function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => { wsReady = true; while (pendingOpens.length) ws.send(pendingOpens.shift()); };
  ws.onclose = () => { wsReady = false; setTimeout(connect, 1000); };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "output") {
      const p = state.panes.get(msg.paneId);
      if (!p) return;
      const bytes = b64ToU8(msg.data);
      p.term.write(bytes);
      handleActivity(msg.paneId, bytes);
    } else if (msg.type === "exit") {
      const p = state.panes.get(msg.paneId);
      if (p) { p.exited = true; p.el.classList.add("exited"); p.term.write("\r\n\x1b[90m[process exited] press Enter to restart\x1b[0m\r\n"); }
    } else if (msg.type === "session") {
      restoreSession(msg.layout);
    } else if (msg.type === "commands") {
      customCommands = Array.isArray(msg.commands) ? msg.commands : [];
      if (paletteIsOpen()) { paletteCmds = buildPaletteCommands(); renderPalette(); }
    } else if (msg.type === "meta") {
      const p = state.panes.get(msg.paneId);
      if (p) {
        p.meta = { cwd: msg.cwd || "", branch: msg.branch || "", ports: msg.ports || [] };
        const tab = state.tabs.find((t) => t.id === p.tabId);
        if (tab) refreshTabMeta(tab);
      }
    }
  };
}
function wsSend(obj) {
  const data = JSON.stringify(obj);
  if (wsReady && ws.readyState === WebSocket.OPEN) ws.send(data);
  else if (obj.type === "open") pendingOpens.push(data);
}

// ---- session persistence -------------------------------------------------
function serialize() {
  return {
    activeTabId: state.activeTabId,
    settings: { fontSize },
    tabs: state.tabs.map((t) => ({ id: t.id, name: t.name, cwd: t.cwd, tree: t.tree, customName: !!t.customName })),
  };
}
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => wsSend({ type: "session", layout: serialize() }), 200);
}

function restoreSession(layout) {
  if (state.tabs.length) return;
  if (layout && layout.settings && layout.settings.fontSize) {
    fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, layout.settings.fontSize));
  }
  if (!layout || !layout.tabs || !layout.tabs.length) { newTab(); return; }
  for (const t of layout.tabs) {
    const tab = { id: t.id || uid(), name: t.name || "shell", cwd: t.cwd, tree: t.tree, customName: !!t.customName };
    state.tabs.push(tab);
    createTabPaneEl(tab);
    instantiateTree(tab, tab.tree);
    renderTab(tab);
  }
  const wanted = layout.activeTabId && state.tabs.find((x) => x.id === layout.activeTabId);
  activateTab(wanted ? layout.activeTabId : state.tabs[0].id);
  renderTabList();
}

function instantiateTree(tab, node) {
  if (!node) return;
  if (node.kind === "leaf") {
    createPane(node.id, tab.id, tab.cwd);
  } else {
    instantiateTree(tab, node.children[0]);
    instantiateTree(tab, node.children[1]);
  }
}

// ---- ids -----------------------------------------------------------------
function uid() { return (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2); }

// ---- tabs ----------------------------------------------------------------
function newTab(cwd) {
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

function createTabPaneEl(tab) {
  const el = document.createElement("div");
  el.className = "tabpane";
  el.dataset.tabId = tab.id;
  workspace.appendChild(el);
  tab.el = el;
}

function activateTab(tabId) {
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

function closeTab(tabId) {
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

function renderTabList() {
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
function refreshTabClasses() {
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

// The metadata (cwd/branch/ports) shown for a tab comes from its naming pane:
// the focused pane if it's in this tab, else the first pane.
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

// cmux-style sidebar sub-line: git branch · working dir · pane count.
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
  // Listening-port pills.
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
function refreshTabMeta(tab) {
  if (renaming) return;
  const row = [...tablistEl.children].find((r) => r.dataset.tabId === tab.id);
  if (row) fillTabMeta(row, tab);
}

function countPaneAttention(tab) {
  let n = 0;
  eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (q && q.attention) n++; });
  return n;
}

// ---- tab context menu (right-click) --------------------------------------
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

// ---- small formatting helpers --------------------------------------------
function countLeaves(node) {
  return node.kind === "leaf" ? 1 : countLeaves(node.children[0]) + countLeaves(node.children[1]);
}
function shortPath(cwd) {
  if (!cwd) return "zsh";
  const parts = cwd.split("/").filter(Boolean);
  const tail = parts.slice(-2).join("/");
  return "~/" + tail;
}

// ---- titles --------------------------------------------------------------
// Turn a raw OSC terminal title into a concise label.
function cleanTitle(t) {
  t = (t || "").trim();
  t = t.replace(/^\S+@\S+:\s*/, "");   // drop "user@host: " prefix if present
  t = t.replace(/\s+/g, " ");
  // A bare path (no spaces, starts with / or ~) -> show only the last segment,
  // e.g. "/Users/me/Desktop/new-cmux" becomes "new-cmux". Commands (which
  // contain spaces) are left as-is.
  if (/^[~/]/.test(t) && !/\s/.test(t)) {
    const seg = t.replace(/\/+$/, "").split("/").filter(Boolean).pop();
    if (seg) t = seg;
  }
  if (t.length > 40) t = t.slice(0, 39) + "…";
  return t || "shell";
}

function setPaneTitle(paneId, raw) {
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

function updateTabName(tab) {
  if (tab.customName) return; // user renamed it; leave it alone
  if (renaming) return;       // don't rebuild the list while an input is open
  const p = namingPane(tab);
  const name = (p && p.title) || "shell";
  if (name !== tab.name) { tab.name = name; renderTabList(); persist(); }
}

// Inline rename: swap the name label for an input. Empty value re-enables the
// automatic (title-driven) name.
function startRename(tab, nameEl) {
  renaming = true;
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = tab.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (save) => {
    if (done) return; done = true;
    renaming = false;
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

// ---- pane tree helpers ---------------------------------------------------
function firstLeaf(node) { return node.kind === "leaf" ? node : firstLeaf(node.children[0]); }
function eachLeaf(node, fn) {
  if (!node) return;
  if (node.kind === "leaf") fn(node);
  else { eachLeaf(node.children[0], fn); eachLeaf(node.children[1], fn); }
}
function findLeaf(node, id, parent) {
  if (node.kind === "leaf") return node.id === id ? { node, parent } : null;
  return findLeaf(node.children[0], id, node) || findLeaf(node.children[1], id, node);
}

// ---- panes ---------------------------------------------------------------
function createPane(paneId, tabId, cwd) {
  const term = new Terminal({
    fontFamily: FONT_FAMILY,
    fontSize: fontSize,
    lineHeight: FONT_LINE_HEIGHT,
    letterSpacing: 0,
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true,
    theme: TERM_THEME,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);

  const el = document.createElement("div");
  el.className = "leaf node";
  el.dataset.paneId = paneId;
  const titleText = cwd ? cwd.split("/").filter(Boolean).pop() : "shell";
  el.innerHTML = `
    <div class="leaf-bar">
      <span class="ico">${ICON.folder}</span>
      <span class="attn-dot"></span>
      <span class="title"></span>
      <div class="actions">
        <button data-act="split-h" title="Split right (Cmd-D)">${ICON.splitH}</button>
        <button data-act="split-v" title="Split down (Cmd-Shift-D)">${ICON.splitV}</button>
        <button class="close" data-act="close" title="Close (Cmd-W)">${ICON.close}</button>
      </div>
    </div>
    <div class="leaf-term"></div>`;
  const titleEl = el.querySelector(".title");
  titleEl.textContent = titleText;
  const termEl = el.querySelector(".leaf-term");
  term.open(termEl);

  // Auto-title: programs (and the shell via OMZ) set the terminal title with an
  // OSC escape; xterm surfaces it here. We use it to name the pane + tab.
  term.onTitleChange((t) => setPaneTitle(paneId, t));

  el.querySelector('[data-act="split-h"]').onclick = (e) => { e.stopPropagation(); splitPane(paneId, "h"); };
  el.querySelector('[data-act="split-v"]').onclick = (e) => { e.stopPropagation(); splitPane(paneId, "v"); };
  el.querySelector('[data-act="close"]').onclick = (e) => { e.stopPropagation(); closePane(paneId); };
  el.addEventListener("mousedown", () => focusPane(paneId));

  term.onData((d) => {
    const p = state.panes.get(paneId);
    if (p && p.exited) { if (d === "\r") restartPane(paneId); return; }
    wsSend({ type: "input", paneId, data: u8ToB64(enc.encode(d)) });
  });
  term.attachCustomKeyEventHandler((e) => handleGlobalKey(e, paneId));

  const ro = new ResizeObserver(() => refit(paneId));
  ro.observe(termEl);

  const pane = { id: paneId, term, fit, tabId, cwd, exited: false, el, termEl, ro, titleEl, title: titleText, attention: false, idleTimer: null, meta: { cwd: cwd || "", branch: "", ports: [] } };
  state.panes.set(paneId, pane);

  requestAnimationFrame(() => {
    refit(paneId);
    const dims = fit.proposeDimensions();
    wsSend({ type: "open", paneId, cwd: cwd || undefined, cols: dims ? dims.cols : 80, rows: dims ? dims.rows : 24 });
  });
  return pane;
}

// Live font-size control, applied to every pane and persisted.
function setFontSize(n) {
  fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, n));
  for (const p of state.panes.values()) {
    p.term.options.fontSize = fontSize;
  }
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (tab) refitTab(tab);
  persist();
}

function refit(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (!tab || tab.id !== state.activeTabId) return;
  try {
    p.fit.fit();
    wsSend({ type: "resize", paneId, cols: p.term.cols, rows: p.term.rows });
  } catch (_) {}
}
function refitTab(tab) { eachLeaf(tab.tree, (leaf) => refit(leaf.id)); }

function focusPane(paneId) {
  if (state.focusedPaneId && state.panes.has(state.focusedPaneId))
    state.panes.get(state.focusedPaneId).el.classList.remove("focused");
  const p = state.panes.get(paneId);
  if (!p) return;
  state.focusedPaneId = paneId;
  p.el.classList.add("focused");
  p.term.focus();
  clearPaneAttention(p);
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { updateTabName(tab); refreshTabMeta(tab); }
}

function destroyPane(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  try { p.ro.disconnect(); } catch (_) {}
  clearTimeout(p.idleTimer);
  wsSend({ type: "close", paneId });
  p.term.dispose();
  state.panes.delete(paneId);
}

function restartPane(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  p.exited = false; p.el.classList.remove("exited");
  p.term.reset();
  const dims = p.fit.proposeDimensions();
  wsSend({ type: "open", paneId, cwd: p.cwd || undefined, cols: dims ? dims.cols : 80, rows: dims ? dims.rows : 24 });
}

// ---- splitting -----------------------------------------------------------
function splitPane(paneId, dir) {
  const src = state.panes.get(paneId);
  if (!src) return;
  const tab = state.tabs.find((t) => t.id === src.tabId);
  if (!tab) return;
  const found = findLeaf(tab.tree, paneId, null);
  if (!found) return;
  const newId = uid();
  const split = { kind: "split", dir, children: [{ kind: "leaf", id: paneId }, { kind: "leaf", id: newId }] };
  if (found.parent) {
    const i = found.parent.children.indexOf(found.node);
    found.parent.children[i] = split;
  } else {
    tab.tree = split;
  }
  createPane(newId, tab.id, tab.cwd);
  renderTab(tab);
  focusPane(newId);
  refitTab(tab);
  persist();
}

function closePane(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (!tab) return;
  const found = findLeaf(tab.tree, paneId, null);
  destroyPane(paneId);
  if (!found.parent) { closeTab(tab.id); return; }
  const sibling = found.parent.children.find((c) => c !== found.node);
  const grand = findParentOf(tab.tree, found.parent, null);
  if (grand) {
    const i = grand.children.indexOf(found.parent);
    grand.children[i] = sibling;
  } else {
    tab.tree = sibling;
  }
  renderTab(tab);
  const nl = firstLeaf(tab.tree);
  if (nl) focusPane(nl.id);
  refitTab(tab);
  persist();
}
function findParentOf(node, target, parent) {
  if (node.kind === "leaf") return null;
  if (node === target) return parent;
  return findParentOf(node.children[0], target, node) || findParentOf(node.children[1], target, node);
}

// ---- rendering the tree --------------------------------------------------
function renderTab(tab) {
  tab.el.innerHTML = "";
  tab.el.appendChild(renderNode(tab.tree));
}
function renderNode(node) {
  if (node.kind === "leaf") {
    const p = state.panes.get(node.id);
    return p ? p.el : document.createElement("div");
  }
  const split = document.createElement("div");
  split.className = "split node " + node.dir;
  split.appendChild(renderNode(node.children[0]));
  split.appendChild(renderNode(node.children[1]));
  return split;
}

// ---- attention -----------------------------------------------------------
// A background pane earns an attention ring when it rings the bell (BEL) or,
// more usefully for AI agents, when it produces output and then goes quiet --
// i.e. it finished its turn or is waiting for the user's answer.
const ATTN_IDLE_MS = 700;

function paneIsForeground(p) {
  return p.tabId === state.activeTabId && p.id === state.focusedPaneId && windowFocused;
}

function handleActivity(paneId, bytes) {
  const p = state.panes.get(paneId);
  if (!p) return;
  if (paneIsForeground(p)) { clearPaneAttention(p); return; } // user is watching
  if (bytes.includes(7)) { setPaneAttention(p); return; }     // bell: immediate
  // Otherwise wait for the burst of output to settle, then ring.
  clearTimeout(p.idleTimer);
  p.idleTimer = setTimeout(() => { if (!paneIsForeground(p)) setPaneAttention(p); }, ATTN_IDLE_MS);
}

function anyPaneAttention(tab) {
  let any = false;
  eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (q && q.attention) any = true; });
  return any;
}

function setPaneAttention(p) {
  const firstTime = !p.attention;
  p.attention = true;
  p.el.classList.add("attn");
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { tab.attention = true; refreshTabClasses(); }
  if (firstTime) notifyAttention(p, tab);
}

function clearPaneAttention(p) {
  clearTimeout(p.idleTimer);
  if (p.attention) { p.attention = false; p.el.classList.remove("attn"); }
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { tab.attention = anyPaneAttention(tab); refreshTabClasses(); }
}

// Native desktop notification when panea isn't the pane the user is looking at.
function notifyAttention(p, tab) {
  if (paneIsForeground(p)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const name = (tab && tab.name) || "terminal";
  const n = new Notification("panea — " + name, { body: (p.title || "terminal") + " needs your attention" });
  n.onclick = () => { window.focus(); if (tab) activateTab(tab.id); focusPane(p.id); n.close(); };
}

// ---- keyboard ------------------------------------------------------------
function handleGlobalKey(e, paneId) {
  if (e.type !== "keydown") return true;
  if (!e.metaKey) return true;
  const k = e.key.toLowerCase();
  if (k === "t") { e.preventDefault(); newTab(); return false; }
  if (k === "w") { e.preventDefault(); closePane(state.focusedPaneId || paneId); return false; }
  if (k === "d") { e.preventDefault(); splitPane(state.focusedPaneId || paneId, e.shiftKey ? "v" : "h"); return false; }
  if (k === "=" || k === "+") { e.preventDefault(); setFontSize(fontSize + 1); return false; }
  if (k === "-" || k === "_") { e.preventDefault(); setFontSize(fontSize - 1); return false; }
  if (k === "0") { e.preventDefault(); setFontSize(DEFAULT_FONT_SIZE); return false; }
  if (k >= "1" && k <= "9") {
    const idx = Number(k) - 1;
    if (state.tabs[idx]) { e.preventDefault(); activateTab(state.tabs[idx].id); return false; }
  }
  return true;
}

// ---- command palette (⌘K) ------------------------------------------------
// A cmux-style command palette: built-in actions, per-tab switches, and
// user-defined custom commands (from ~/.panea/commands.json). Fuzzy filter,
// arrow/enter navigation. Custom commands run their shell line in the focused
// pane (or a new tab / split, per the entry's "where").
let customCommands = [];
let paletteEl = null, paletteInput = null, paletteListEl = null;
let paletteCmds = [];   // full command set built when the palette opens
let paletteItems = [];  // current filtered view
let paletteIndex = 0;

function focusedPane() { return state.focusedPaneId && state.panes.get(state.focusedPaneId); }

function runInPane(paneId, text) {
  wsSend({ type: "input", paneId, data: u8ToB64(enc.encode(text)) });
}

// Send a shell command line to a target pane, honoring the entry's "where":
// the focused pane (default), a fresh tab, or a split of the focused pane.
function runCommandLine(run, where) {
  const line = /[\r\n]$/.test(run) ? run : run + "\r";
  if (where === "new-tab" || where === "tab") {
    newTab();
    const p = focusedPane();
    if (p) setTimeout(() => runInPane(p.id, line), 450);
    return;
  }
  if (where === "split" || where === "split-right" || where === "split-down") {
    const src = focusedPane();
    if (src) splitPane(src.id, where === "split-down" ? "v" : "h");
    else newTab();
    const np = focusedPane();
    if (np) setTimeout(() => runInPane(np.id, line), 450);
    return;
  }
  const p = focusedPane();
  if (p) runInPane(p.id, line);
}

function cycleTab(delta) {
  if (!state.tabs.length) return;
  const i = state.tabs.findIndex((t) => t.id === state.activeTabId);
  const n = ((i < 0 ? 0 : i) + delta + state.tabs.length) % state.tabs.length;
  activateTab(state.tabs[n].id);
}

function nextAttentionPane() {
  for (const tab of state.tabs) {
    let target = null;
    eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (!target && q && q.attention) target = q; });
    if (target) { activateTab(tab.id); focusPane(target.id); return; }
  }
}

function renameActiveTab() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;
  const row = [...tablistEl.children].find((r) => r.dataset.tabId === tab.id);
  if (row) startRename(tab, row.querySelector(".name"));
}

function clearFocusedTerminal() {
  const p = focusedPane();
  if (p) p.term.clear();
}

// Assemble the palette: built-in actions + a switch entry per tab + customs.
function buildPaletteCommands() {
  const cmds = [];
  const add = (title, hint, run) => cmds.push({ title, hint, run });
  add("New terminal", "⌘T", () => newTab());
  add("Split right", "⌘D", () => { const p = focusedPane(); if (p) splitPane(p.id, "h"); });
  add("Split down", "⇧⌘D", () => { const p = focusedPane(); if (p) splitPane(p.id, "v"); });
  add("Close pane", "⌘W", () => { const p = focusedPane(); if (p) closePane(p.id); });
  add("Rename tab", "", renameActiveTab);
  add("Next tab", "", () => cycleTab(1));
  add("Previous tab", "", () => cycleTab(-1));
  add("Jump to next notification", "", nextAttentionPane);
  add("Clear terminal", "", clearFocusedTerminal);
  add("Restart pane", "", () => { const p = focusedPane(); if (p) restartPane(p.id); });
  add("Increase font size", "⌘+", () => setFontSize(fontSize + 1));
  add("Decrease font size", "⌘−", () => setFontSize(fontSize - 1));
  add("Reset font size", "⌘0", () => setFontSize(DEFAULT_FONT_SIZE));
  state.tabs.forEach((tab, i) => add(`Switch to: ${tab.name}`, i < 9 ? `⌘${i + 1}` : "", () => activateTab(tab.id)));
  for (const c of customCommands) {
    if (!c || !c.run) continue;
    const where = c.where || c.in || "focused";
    add(c.name || String(c.run), "run · " + where, () => runCommandLine(String(c.run), where));
  }
  return cmds;
}

// Subsequence fuzzy score; contiguous runs score higher. 0 = no match.
function fuzzyScore(hay, needle) {
  hay = hay.toLowerCase(); needle = needle.toLowerCase();
  if (!needle) return 1;
  let hi = 0, score = 0, run = 0;
  for (let ni = 0; ni < needle.length; ni++) {
    let found = -1;
    for (let j = hi; j < hay.length; j++) { if (hay[j] === needle[ni]) { found = j; break; } }
    if (found < 0) return 0;
    run = found === hi ? run + 1 : 0;
    score += 1 + run;
    hi = found + 1;
  }
  return score;
}

function ensurePaletteDom() {
  if (paletteEl) return;
  paletteEl = document.createElement("div");
  paletteEl.id = "palette";
  paletteEl.innerHTML =
    '<div class="palette-box">' +
    '<input class="palette-input" type="text" placeholder="Type a command…" spellcheck="false" autocomplete="off" />' +
    '<div class="palette-list"></div></div>';
  document.body.appendChild(paletteEl);
  paletteInput = paletteEl.querySelector(".palette-input");
  paletteListEl = paletteEl.querySelector(".palette-list");
  paletteEl.addEventListener("mousedown", (e) => { if (e.target === paletteEl) closePalette(); });
  paletteInput.addEventListener("input", () => renderPalette());
  paletteInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); movePalette(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); movePalette(-1); }
    else if (e.key === "Enter") { e.preventDefault(); runPaletteSelection(); }
    else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
  });
}

function paletteIsOpen() { return paletteEl && paletteEl.classList.contains("open"); }

function openPalette() {
  ensurePaletteDom();
  wsSend({ type: "getCommands" }); // refresh customs from disk
  paletteCmds = buildPaletteCommands();
  paletteEl.classList.add("open");
  paletteInput.value = "";
  renderPalette();
  paletteInput.focus();
}

function closePalette() {
  if (!paletteEl) return;
  paletteEl.classList.remove("open");
  const p = focusedPane();
  if (p) p.term.focus();
}

function togglePalette() { paletteIsOpen() ? closePalette() : openPalette(); }

function renderPalette() {
  const q = paletteInput.value.trim();
  let ranked = paletteCmds.map((cmd) => ({ cmd, s: fuzzyScore(cmd.title + " " + (cmd.hint || ""), q) }));
  if (q) ranked = ranked.filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
  paletteItems = ranked.slice(0, 60).map((r) => r.cmd);
  paletteIndex = 0;
  paletteListEl.innerHTML = "";
  paletteItems.forEach((cmd, i) => {
    const row = document.createElement("div");
    row.className = "palette-item" + (i === 0 ? " sel" : "");
    row.innerHTML = '<span class="pi-title"></span><span class="pi-hint"></span>';
    row.querySelector(".pi-title").textContent = cmd.title;
    row.querySelector(".pi-hint").textContent = cmd.hint || "";
    row.onmousemove = () => setPaletteIndex(i);
    row.onclick = () => { setPaletteIndex(i); runPaletteSelection(); };
    paletteListEl.appendChild(row);
  });
  if (!paletteItems.length) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "No matching commands";
    paletteListEl.appendChild(empty);
  }
}

function setPaletteIndex(i) {
  paletteIndex = i;
  [...paletteListEl.children].forEach((el, j) => el.classList.toggle("sel", j === i));
}

function movePalette(delta) {
  if (!paletteItems.length) return;
  const n = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
  setPaletteIndex(n);
  const el = paletteListEl.children[n];
  if (el) el.scrollIntoView({ block: "nearest" });
}

function runPaletteSelection() {
  const cmd = paletteItems[paletteIndex];
  closePalette();
  if (cmd) setTimeout(() => cmd.run(), 0);
}

// ⌘K toggles the palette from anywhere (capture phase so the terminal textarea
// never sees the keystroke).
document.addEventListener("keydown", (e) => {
  if (e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "k") {
    e.preventDefault(); e.stopPropagation(); togglePalette();
  }
}, true);

document.getElementById("cmdk").onclick = () => openPalette();

// ---- wiring --------------------------------------------------------------
document.getElementById("new-tab").onclick = () => newTab();
document.getElementById("empty-new").onclick = () => newTab();
document.addEventListener("keydown", (e) => {
  if (e.metaKey && ["t", "w", "d"].includes(e.key.toLowerCase())) {
    if (!e.target.closest || !e.target.closest(".leaf-term")) handleGlobalKey(e, state.focusedPaneId);
  }
});
window.addEventListener("resize", () => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (tab) refitTab(tab);
});

// Track window focus so we only ring / notify when the user isn't already here.
window.addEventListener("focus", () => {
  windowFocused = true;
  const p = state.focusedPaneId && state.panes.get(state.focusedPaneId);
  if (p) clearPaneAttention(p);
});
window.addEventListener("blur", () => { windowFocused = false; });

// Ask once for permission to post native desktop notifications.
if (typeof Notification !== "undefined" && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

connect();
