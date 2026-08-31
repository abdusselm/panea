

import { state, runtime } from "./state.js";
import { TERM_THEME, FONT_FAMILY, FONT_LINE_HEIGHT, MIN_FONT_SIZE, MAX_FONT_SIZE, ICON } from "./theme.js";
import { enc, u8ToB64, uid, firstLeaf, eachLeaf, findLeaf, findParentOf } from "./util.js";
import { wsSend } from "./ws.js";
import { setPaneTitle, updateTabName, refreshTabMeta, closeTab } from "./tabs.js";
import { clearPaneAttention, signalExplicit } from "./attention.js";
import { handleGlobalKey } from "./keyboard.js";
import { persist } from "./session.js";
import { closeFindFor } from "./find.js";
import { mountResumeBar } from "./agents.js";
import { wirePaneArrange } from "./pane-arrange.js";
import { wirePaneIdentity, applyPaneIdentity } from "./pane-identity.js";
import { wireScrollAnchor, closeScrollAnchorFor } from "./scroll-anchor.js";
import { requestPaneCwd, forgetPaneCwd } from "./pane-cwd.js";

const { Terminal } = window;
const FitAddon = window.FitAddon;
const SearchAddon = window.SearchAddon;
const SerializeAddon = window.SerializeAddon;

const SCROLLBACK = 5000;

const RESTORE_MARKER = "──── restored session ────";

function scheduleRefit(paneId) {
  const p = state.panes.get(paneId);
  if (!p || p.refitRAF) return;
  p.refitRAF = requestAnimationFrame(() => { p.refitRAF = 0; refit(paneId); });
}

export function createPane(paneId, tabId, cwd, restore, opts) {
  const inheritFrom = (opts && opts.inheritFrom) || "";
  const term = new Terminal({
    fontFamily: FONT_FAMILY,
    fontSize: runtime.fontSize,
    lineHeight: FONT_LINE_HEIGHT,
    letterSpacing: 0,
    cursorBlink: true,

    scrollback: SCROLLBACK,
    allowProposedApi: true,
    theme: TERM_THEME,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);

  const search = SearchAddon ? new SearchAddon.SearchAddon() : null;
  if (search) term.loadAddon(search);

  const serialize = SerializeAddon ? new SerializeAddon.SerializeAddon() : null;
  if (serialize) term.loadAddon(serialize);

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

  term.onTitleChange((t) => setPaneTitle(paneId, t));

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
    if (p && !p.opened) p.queuedInput.push(d);
    else wsSend({ type: "input", paneId, data: u8ToB64(enc.encode(d)) });
    trackAgentPrompt(p, d);
  });
  term.attachCustomKeyEventHandler((e) => handleGlobalKey(e, paneId));

  const ro = new ResizeObserver(() => scheduleRefit(paneId));
  ro.observe(termEl);

  const pane = { id: paneId, term, fit, search, serialize, tabId, cwd, exited: false, opened: false, queuedInput: [], el, termEl, ro, titleEl, title: titleText, customTitle: "", color: "", renaming: false, attention: false, attnReason: "", attnMessage: "", idleTimer: null, burstStart: 0, burstBytes: 0, refitRAF: 0, restoreAgent: (restore && restore.agent) || "", promptBuf: "", lastPrompt: "", meta: { cwd: cwd || "", branch: "", ports: [], agent: "" } };
  state.panes.set(paneId, pane);
  wirePaneArrange(pane);
  wirePaneIdentity(pane);
  wireScrollAnchor(pane);
  applyPaneIdentity(pane, restore);

  if (restore) {
    if (restore.scroll) {
      const hist = restore.scroll

        .replace(/\x1b\[\?[0-9;]*[hl]/g, "")

        .split(/\r?\n/).filter((l) => !l.includes(RESTORE_MARKER)).join("\r\n");
      term.write(hist);
      term.write(`\r\n\x1b[90m${RESTORE_MARKER}\x1b[0m\r\n`);
    }
    if (restore.agent) mountResumeBar(pane, restore.agent);
  }

  requestAnimationFrame(() => {
    refit(paneId);
    if (!inheritFrom) { openShell(pane, cwd); return; }
    requestPaneCwd(inheritFrom, cwd, wsSend).then((live) => openShell(pane, live || cwd));
  });
  return pane;
}

function openShell(pane, cwd) {
  if (!state.panes.has(pane.id)) return;
  let dims = null;
  try { dims = pane.fit.proposeDimensions(); } catch (_) {}
  if (cwd && cwd !== pane.cwd) {
    pane.cwd = cwd;
    pane.meta.cwd = cwd;
    setPaneTitle(pane.id, cwd.split("/").filter(Boolean).pop() || "shell");
  }
  wsSend({ type: "open", paneId: pane.id, cwd: cwd || undefined, cols: dims ? dims.cols : 80, rows: dims ? dims.rows : 24 });
  pane.opened = true;
  for (const d of pane.queuedInput) wsSend({ type: "input", paneId: pane.id, data: u8ToB64(enc.encode(d)) });
  pane.queuedInput = [];
}

export function reattachPanes() {
  for (const p of state.panes.values()) {
    if (p.exited) continue;
    let dims = null;
    try { dims = p.fit.proposeDimensions(); } catch (_) {}
    wsSend({
      type: "attach",
      paneId: p.id,
      cols: dims ? dims.cols : p.term.cols,
      rows: dims ? dims.rows : p.term.rows,
    });
  }
}

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
  closeFindFor(paneId);
  closeScrollAnchorFor(paneId);
  forgetPaneCwd(paneId);
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

const PROMPT_MAX = 200;
function trackAgentPrompt(p, d) {
  if (!p || !(p.meta.agent || p.restoreAgent)) return;
  d = d.replace(/\x1b\[20[01]~/g, "");
  for (const ch of d) {
    const code = ch.codePointAt(0);
    if (ch === "\r" || ch === "\n") finalizePrompt(p);
    else if (code === 0x7f || code === 0x08) p.promptBuf = p.promptBuf.slice(0, -1);
    else if (code === 0x15 || code === 0x03) p.promptBuf = "";
    else if (code === 0x1b) break;
    else if (code >= 0x20) p.promptBuf += ch;
  }
}
function finalizePrompt(p) {
  const text = p.promptBuf.trim().slice(0, PROMPT_MAX);
  p.promptBuf = "";
  if (!text) return;
  p.lastPrompt = text;
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) refreshTabMeta(tab);
}

export function splitPane(paneId, dir) {
  const src = state.panes.get(paneId);
  if (!src) return;
  const tab = state.tabs.find((t) => t.id === src.tabId);
  if (!tab) return;
  const found = findLeaf(tab.tree, paneId, null);
  if (!found) return;
  const newId = uid();
  const split = { kind: "split", dir, ratio: 0.5, children: [{ kind: "leaf", id: paneId }, { kind: "leaf", id: newId }] };
  if (found.parent) {
    const i = found.parent.children.indexOf(found.node);
    found.parent.children[i] = split;
  } else {
    tab.tree = split;
  }
  createPane(newId, tab.id, (src.meta && src.meta.cwd) || src.cwd || tab.cwd, null, { inheritFrom: paneId });
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

export function renderTab(tab) {
  tab.el.innerHTML = "";
  tab.el.appendChild(renderNode(tab.tree));
}

const MIN_RATIO = 0.08;
function clampRatio(r) { return Math.max(MIN_RATIO, Math.min(1 - MIN_RATIO, r)); }
function applyRatio(a, b, r) { a.style.flexGrow = String(r); b.style.flexGrow = String(1 - r); }

function renderNode(node) {
  if (node.kind === "leaf") {
    const p = state.panes.get(node.id);
    return p ? p.el : document.createElement("div");
  }
  const split = document.createElement("div");
  split.className = "split node " + node.dir;
  const a = renderNode(node.children[0]);
  const b = renderNode(node.children[1]);

  const gutter = document.createElement("div");
  gutter.className = "split-gutter";
  split.append(a, gutter, b);
  const r = clampRatio(typeof node.ratio === "number" ? node.ratio : 0.5);
  node.ratio = r;
  applyRatio(a, b, r);
  wireGutter(split, gutter, node, a, b);
  return split;
}

function wireGutter(split, gutter, node, a, b) {
  gutter.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const horiz = node.dir === "h";
    gutter.classList.add("dragging");
    document.body.classList.add("resizing-split");
    document.body.style.cursor = horiz ? "col-resize" : "row-resize";
    const onMove = (ev) => {
      const rect = split.getBoundingClientRect();
      const r = clampRatio(horiz
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height);
      node.ratio = r;
      applyRatio(a, b, r);
    };
    const onUp = () => {
      gutter.classList.remove("dragging");
      document.body.classList.remove("resizing-split");
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      persist();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}
