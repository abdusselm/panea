// Panes: create/destroy xterm terminals, the split-tree layout, focus, resize,
// restart, and tree-to-DOM rendering.

import { state, runtime } from "./state.js";
import { TERM_THEME, FONT_FAMILY, FONT_LINE_HEIGHT, MIN_FONT_SIZE, MAX_FONT_SIZE, ICON } from "./theme.js";
import { enc, u8ToB64, uid, firstLeaf, eachLeaf, findLeaf, findParentOf } from "./util.js";
import { wsSend } from "./ws.js";
import { setPaneTitle, updateTabName, refreshTabMeta, closeTab } from "./tabs.js";
import { clearPaneAttention, signalExplicit } from "./attention.js";
import { handleGlobalKey } from "./keyboard.js";
import { persist } from "./session.js";

const { Terminal } = window;
const FitAddon = window.FitAddon;

const SCROLLBACK = 5000;

// Coalesce refit requests: a ResizeObserver can fire many times per frame
// (window drag, split creation), and each fit() forces a reflow + a resize
// message. Collapse them to at most one fit per pane per animation frame.
function scheduleRefit(paneId) {
  const p = state.panes.get(paneId);
  if (!p || p.refitRAF) return;
  p.refitRAF = requestAnimationFrame(() => { p.refitRAF = 0; refit(paneId); });
}

export function createPane(paneId, tabId, cwd) {
  const term = new Terminal({
    fontFamily: FONT_FAMILY,
    fontSize: runtime.fontSize,
    lineHeight: FONT_LINE_HEIGHT,
    letterSpacing: 0,
    cursorBlink: true,
    // Scrollback is a per-pane memory cost (xterm keeps a typed-array buffer per
    // line). 5000 lines is generous for a terminal while staying thrifty across
    // many open splits; raise SCROLLBACK if you need deeper history.
    scrollback: SCROLLBACK,
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

  // Auto-title: programs (and the shell) set the terminal title with an OSC
  // escape; xterm surfaces it here. We use it to name the pane + tab.
  term.onTitleChange((t) => setPaneTitle(paneId, t));

  // Explicit notification escapes: a program deliberately asking to notify the
  // user. OSC 9 (iTerm2 style): `ESC ] 9 ; message BEL`. OSC 777 (kitty/urxvt
  // style): `ESC ] 777 ; notify ; title ; body BEL`. Returning true marks them
  // handled so xterm doesn't try to render the payload.
  term.parser.registerOscHandler(9, (data) => { signalExplicit(paneId, (data || "").trim()); return true; });
  term.parser.registerOscHandler(777, (data) => {
    const parts = String(data || "").split(";");
    if (parts[0] === "notify") signalExplicit(paneId, (parts.slice(2).join(";") || parts[1] || "").trim());
    return true;
  });

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

  const ro = new ResizeObserver(() => scheduleRefit(paneId));
  ro.observe(termEl);

  const pane = { id: paneId, term, fit, tabId, cwd, exited: false, el, termEl, ro, titleEl, title: titleText, attention: false, attnReason: "", attnMessage: "", idleTimer: null, burstStart: 0, burstBytes: 0, refitRAF: 0, meta: { cwd: cwd || "", branch: "", ports: [] } };
  state.panes.set(paneId, pane);

  requestAnimationFrame(() => {
    refit(paneId);
    const dims = fit.proposeDimensions();
    wsSend({ type: "open", paneId, cwd: cwd || undefined, cols: dims ? dims.cols : 80, rows: dims ? dims.rows : 24 });
  });
  return pane;
}

// Live font-size control, applied to every pane and persisted.
export function setFontSize(n) {
  runtime.fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, n));
  for (const p of state.panes.values()) p.term.options.fontSize = runtime.fontSize;
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (tab) refitTab(tab);
  persist();
}

export function refit(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (!tab || tab.id !== state.activeTabId) return;
  try {
    p.fit.fit();
    wsSend({ type: "resize", paneId, cols: p.term.cols, rows: p.term.rows });
  } catch (_) {}
}
export function refitTab(tab) { eachLeaf(tab.tree, (leaf) => scheduleRefit(leaf.id)); }

export function focusPane(paneId) {
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

export function destroyPane(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  try { p.ro.disconnect(); } catch (_) {}
  if (p.refitRAF) cancelAnimationFrame(p.refitRAF);
  clearTimeout(p.idleTimer);
  wsSend({ type: "close", paneId });
  p.term.dispose();
  state.panes.delete(paneId);
}

export function restartPane(paneId) {
  const p = state.panes.get(paneId);
  if (!p) return;
  p.exited = false; p.el.classList.remove("exited");
  p.term.reset();
  const dims = p.fit.proposeDimensions();
  wsSend({ type: "open", paneId, cwd: p.cwd || undefined, cols: dims ? dims.cols : 80, rows: dims ? dims.rows : 24 });
}

// ---- splitting -----------------------------------------------------------
export function splitPane(paneId, dir) {
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

export function closePane(paneId) {
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

// ---- tree -> DOM ---------------------------------------------------------
export function renderTab(tab) {
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
