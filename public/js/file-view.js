import { state, runtime } from "./state.js";
import { ICON } from "./theme.js";
import { eachLeaf, firstLeaf } from "./util.js";
import { wsSend } from "./ws.js";
import { persist } from "./session.js";
import { splitPane, closePane, focusPane } from "./panes.js";
import { updateTabName } from "./tabs.js";
import { isViewerPane } from "./pane-kind.js";
import { wirePaneArrange } from "./pane-arrange.js";
import { wirePaneIdentity, applyPaneIdentity, refreshPaneLabel } from "./pane-identity.js";
import { wirePaneVisibility, applyPaneHidden, showPane } from "./pane-visibility.js";
import { openGit } from "./git.js";
import { baseName } from "./file-tree-model.js";
import {
  languageFor, textLines, splitHighlighted, plainHtmlLines, lineMarkMap, findMatches, clampLine,
} from "./file-view-model.js";

const REQUEST_TIMEOUT_MS = 8000;
const RELOAD_MIN_MS = 1000;
const CHUNK = 200;
const FIND_ALL = "viewer-find";
const FIND_CUR = "viewer-find-current";

const pending = new Map();
let nextReqId = 1;
let watchedRoot = "";
let hljsPromise = null;
let findPane = null;

function ensureHighlighter() {
  if (window.hljs) return Promise.resolve(window.hljs);
  if (!hljsPromise) {
    hljsPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "/vendor/highlight.js";
      s.onload = () => resolve(window.hljs || null);
      s.onerror = () => { hljsPromise = null; resolve(null); };
      document.head.appendChild(s);
    });
  }
  return hljsPromise;
}

function requestView(req) {
  const reqId = nextReqId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(reqId); resolve(null); }, REQUEST_TIMEOUT_MS);
    pending.set(reqId, (msg) => { clearTimeout(timer); resolve(msg); });
    wsSend({ type: "getFileView", reqId, root: req.root || undefined, cwd: req.cwd || undefined, path: req.path });
  });
}

export function setFileView(msg) {
  const done = pending.get(msg.reqId);
  if (!done) return;
  pending.delete(msg.reqId);
  done(msg);
}

function activeTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}

function viewerIn(tab) {
  let found = null;
  if (tab) eachLeaf(tab.tree, (leaf) => {
    const p = state.panes.get(leaf.id);
    if (!found && isViewerPane(p)) found = p;
  });
  return found;
}

function isVisible(p) {
  return p.tabId === state.activeTabId && !p.hidden;
}

export async function openInViewer({ root, cwd, path, line = 0, from = "tree" } = {}) {
  if (!path) return false;
  const res = await requestView({ root, cwd, path });
  if (!res) return false;
  const tab = activeTab();
  if (!tab) return false;
  let p = viewerIn(tab);
  if (res.error && from === "link" && !p) return false;
  if (!p) {
    const focused = state.focusedPaneId && state.panes.get(state.focusedPaneId);
    const anchor = focused && focused.tabId === tab.id ? focused.id : (firstLeaf(tab.tree) || {}).id;
    if (!anchor) return false;
    splitPane(anchor, "h", { viewer: { data: res, line } });
    return true;
  }
  if (p.hidden) showPane(p.id);
  await show(p, res, { line });
  focusPane(p.id);
  persist();
  return true;
}

export function createViewerPane(paneId, tabId, spec = {}, restore) {
  const el = document.createElement("div");
  el.className = "leaf node viewer-leaf";
  el.dataset.paneId = paneId;
  el.style.setProperty("--viewer-font", runtime.fontSize + "px");
  el.innerHTML = `
    <div class="leaf-bar">
      <span class="ico">${ICON.file}</span>
      <span class="attn-dot"></span>
      <span class="title"></span>
      <div class="actions">
        <button data-act="changes" title="Show changes in the git panel">${ICON.changes}</button>
        <button data-act="wrap" title="Wrap long lines">${ICON.wrap}</button>
        <button data-act="reload" title="Reload">${ICON.reload}</button>
        <button data-act="split-h" title="Split right (Cmd-D)">${ICON.splitH}</button>
        <button data-act="split-v" title="Split down (Cmd-Shift-D)">${ICON.splitV}</button>
        <button data-act="hide" title="Hide pane">${ICON.eyeOff}</button>
        <button class="close" data-act="close" title="Close (Cmd-W)">${ICON.close}</button>
      </div>
    </div>
    <div class="viewer-sub"><span class="viewer-path"></span><span class="viewer-info"></span></div>
    <div class="viewer-find" hidden>
      <input class="viewer-find-input" spellcheck="false" autocomplete="off" placeholder="Find in file" />
      <span class="viewer-find-count"></span>
      <button data-find="prev" title="Previous (Shift-Enter)">${ICON.chevronUp}</button>
      <button data-find="next" title="Next (Enter)">${ICON.chevronDown}</button>
      <button data-find="close" title="Close (Esc)">${ICON.close}</button>
    </div>
    <div class="viewer-body" tabindex="0"><div class="viewer-lines"></div></div>`;

  const pane = {
    id: paneId,
    kind: "viewer",
    tabId,
    el,
    titleEl: el.querySelector(".title"),
    pathEl: el.querySelector(".viewer-path"),
    infoEl: el.querySelector(".viewer-info"),
    findEl: el.querySelector(".viewer-find"),
    findInput: el.querySelector(".viewer-find-input"),
    findCount: el.querySelector(".viewer-find-count"),
    view: el.querySelector(".viewer-body"),
    linesEl: el.querySelector(".viewer-lines"),
    root: spec.root || "",
    rel: spec.rel || "",
    wrap: !!spec.wrap,
    data: null,
    lines: [],
    matches: [],
    matchIdx: -1,
    hlLine: 0,
    stale: false,
    lastLoad: 0,
    reloadTimer: null,
    title: spec.rel ? baseName(spec.rel) : "file",
    customTitle: "",
    color: "",
    hidden: false,
    exited: false,
    renaming: false,
    attention: false,
    attnReason: "",
    attnMessage: "",
    idleTimer: null,
    refitRAF: 0,
    exchanges: [],
    queuedInput: [],
    cwd: spec.root || "",
    meta: { cwd: spec.root || "", branch: "", ports: [], agent: "" },
  };
  state.panes.set(paneId, pane);
  pane.titleEl.textContent = pane.title;
  pane.view.classList.toggle("wrap", pane.wrap);

  const act = (name, fn) => {
    el.querySelector(`[data-act="${name}"]`).onclick = (e) => { e.stopPropagation(); fn(); };
  };
  act("changes", () => { if (pane.root && pane.rel) openGit({ cwd: pane.root, select: pane.rel }); });
  act("wrap", () => { pane.wrap = !pane.wrap; pane.view.classList.toggle("wrap", pane.wrap); persist(); });
  act("reload", () => reload(pane));
  act("split-h", () => splitPane(paneId, "h"));
  act("split-v", () => splitPane(paneId, "v"));
  act("close", () => closePane(paneId));
  el.addEventListener("mousedown", () => focusPane(paneId));
  el.addEventListener("focusin", () => { if (state.focusedPaneId !== paneId) focusPane(paneId); });
  pane.view.addEventListener("keydown", (e) => onBodyKey(pane, e));
  pane.view.addEventListener("scroll", () => { pane.scrollTop = pane.view.scrollTop; }, { passive: true });
  wireFind(pane);

  wirePaneArrange(pane);
  wirePaneIdentity(pane);
  wirePaneVisibility(pane);
  applyPaneIdentity(pane, restore);
  applyPaneHidden(pane, restore);

  if (spec.data) show(pane, spec.data, { line: spec.line });
  else if (pane.root && pane.rel) load(pane, { scroll: Number(spec.scroll) || 0 });
  else message(pane, "No file");
  return pane;
}

export function focusViewerPane(p) {
  if (!p.el.contains(document.activeElement)) {
    try { p.view.focus({ preventScroll: true }); } catch (_) {}
  }
  if (p.stale) reload(p);
}

export function destroyViewerPane(p) {
  clearTimeout(p.reloadTimer);
  if (findPane === p) clearFindHighlights();
  const root = p.root;
  p.root = "";
  if (root && root === watchedRoot && !anyViewerOn(root)) {
    watchedRoot = "";
    wsSend({ type: "unwatchView" });
  }
}

function anyViewerOn(root) {
  for (const p of state.panes.values()) if (isViewerPane(p) && p.root === root) return true;
  return false;
}

function watch(root) {
  if (!root || root === watchedRoot) return;
  watchedRoot = root;
  wsSend({ type: "watchView", root });
}

export function viewerReconnected() {
  if (watchedRoot) wsSend({ type: "watchView", root: watchedRoot });
  for (const p of state.panes.values()) if (isViewerPane(p) && p.root) p.stale = true;
  const tab = activeTab();
  const p = viewerIn(tab);
  if (p && !p.hidden) reload(p);
}

export function viewChanged(msg) {
  for (const p of state.panes.values()) {
    if (!isViewerPane(p) || p.root !== msg.root) continue;
    if (isVisible(p)) scheduleReload(p);
    else p.stale = true;
  }
}

function scheduleReload(p) {
  if (p.reloadTimer) return;
  const wait = Math.max(0, p.lastLoad + RELOAD_MIN_MS - Date.now());
  p.reloadTimer = setTimeout(() => { p.reloadTimer = null; reload(p); }, wait);
}

function reload(p) {
  if (!p.root || !p.rel) return;
  load(p, { keepScroll: true });
}

async function load(p, opts = {}) {
  p.stale = false;
  p.lastLoad = Date.now();
  const res = await requestView({ root: p.root, path: p.rel });
  if (!state.panes.has(p.id)) return;
  if (!res) { message(p, "Could not load this file"); return; }
  await show(p, res, opts);
}

function message(p, text) {
  p.data = null;
  p.lines = [];
  p.linesEl.innerHTML = "";
  const box = document.createElement("div");
  box.className = "viewer-empty";
  box.textContent = text;
  p.linesEl.appendChild(box);
}

function describe(res, lineCount) {
  if (res.error === "outside this project") return "This file is outside the project";
  if (res.error === "not found") return "File not found";
  if (res.error) return "Could not open this file (" + res.error + ")";
  if (res.binary) return "Binary file — not shown";
  if (res.tooLarge) return "File is larger than 1 MB — not shown";
  return lineCount ? "" : "Empty file";
}

function changeSummary(res, kinds, dels) {
  if (res.allAdded) return "new file";
  const n = kinds.size + dels.size;
  return n ? n + (n === 1 ? " changed line" : " changed lines") : "";
}

async function show(p, res, { line = 0, keepScroll = false, scroll = 0 } = {}) {
  const prevTop = p.view.scrollTop;
  const prevLeft = p.view.scrollLeft;
  const sameText = p.data && res.content !== undefined && p.data.content === res.content && p.data.rel === res.rel;
  if (res.root) {
    p.root = res.root;
    p.cwd = res.root;
    p.meta.cwd = res.root;
    watch(res.root);
  }
  if (res.rel) {
    p.rel = res.rel;
    p.title = baseName(res.rel);
    refreshPaneLabel(p);
    const tab = state.tabs.find((t) => t.id === p.tabId);
    if (tab) updateTabName(tab);
  }
  p.pathEl.textContent = p.rel;
  p.pathEl.title = p.root && p.rel ? p.root + "/" + p.rel : "";

  const lines = res.content !== undefined ? textLines(res.content) : [];
  const note = describe(res, res.content !== undefined ? res.content.length : 0);
  const { kinds, dels } = lineMarkMap(res.marks, res.allAdded, lines.length);
  const summary = changeSummary(res, kinds, dels);
  p.el.querySelector('[data-act="changes"]').disabled = !summary;
  const info = [];
  if (res.content !== undefined) info.push(lines.length + (lines.length === 1 ? " line" : " lines"));
  if (summary) info.push(summary);
  if (res.plain) info.push("plain text (large file)");
  p.infoEl.textContent = info.join(" · ");

  if (res.content === undefined || note) {
    p.data = res;
    message(p, note);
    return;
  }

  if (sameText) {
    p.data = res;
    applyMarks(p, kinds, dels);
    if (line) requestAnimationFrame(() => revealLine(p, line));
    return;
  }

  const lang = res.plain ? "" : languageFor(res.rel);
  let htmlLines = null;
  if (lang) {
    const hljs = await ensureHighlighter();
    if (!state.panes.has(p.id)) return;
    if (hljs && hljs.getLanguage(lang)) {
      try { htmlLines = splitHighlighted(hljs.highlight(res.content, { language: lang, ignoreIllegals: true }).value, res.content); }
      catch (_) { htmlLines = null; }
    }
  }
  if (!htmlLines || htmlLines.length !== lines.length) htmlLines = plainHtmlLines(res.content);

  p.data = res;
  p.lines = lines;
  p.linesEl.innerHTML = buildHtml(htmlLines, kinds, dels, clampLine(p.hlLine, lines.length));
  if (findPane === p && !p.findEl.hidden) runFind(p, false);

  requestAnimationFrame(() => {
    if (keepScroll) { p.view.scrollTop = prevTop; p.view.scrollLeft = prevLeft; }
    else if (scroll) p.view.scrollTop = scroll;
    else p.view.scrollTop = 0;
    if (line) revealLine(p, line);
  });
}

function lineClass(n, kinds, dels, hlLine) {
  let cls = n === hlLine ? "vl hl" : "vl";
  const k = kinds.get(n);
  if (k) cls += " " + k;
  const d = dels.get(n);
  if (d) cls += " del-" + d;
  return cls;
}

function buildHtml(htmlLines, kinds, dels, hlLine) {
  const out = [];
  for (let i = 0; i < htmlLines.length; i += CHUNK) {
    const end = Math.min(htmlLines.length, i + CHUNK);
    out.push(`<div class="vchunk" style="contain-intrinsic-size:auto ${(end - i) * 1.5}em">`);
    for (let j = i; j < end; j++) {
      const n = j + 1;
      out.push(`<div class="${lineClass(n, kinds, dels, hlLine)}"><span class="vl-n">${n}</span><span class="vl-c">${htmlLines[j] || " "}</span></div>`);
    }
    out.push("</div>");
  }
  return out.join("");
}

function lineEl(p, n) {
  const chunk = p.linesEl.children[Math.floor((n - 1) / CHUNK)];
  return chunk && chunk.classList.contains("vchunk") ? chunk.children[(n - 1) % CHUNK] || null : null;
}

function applyMarks(p, kinds, dels) {
  for (let n = 1; n <= p.lines.length; n++) {
    const el = lineEl(p, n);
    if (!el) break;
    const cls = lineClass(n, kinds, dels, p.hlLine);
    if (el.className !== cls) el.className = cls;
  }
}

function revealLine(p, line) {
  const n = clampLine(line, p.lines.length);
  if (!n) return;
  p.hlLine = n;
  const prev = p.linesEl.querySelector(".vl.hl");
  if (prev) prev.classList.remove("hl");
  const el = lineEl(p, n);
  if (!el) return;
  el.classList.add("hl");
  el.scrollIntoView({ block: "center" });
}

export function viewerSnapshot(p) {
  const snap = { root: p.root, rel: p.rel };
  if (p.wrap) snap.wrap = true;
  const top = Math.round(p.scrollTop || 0);
  if (top) snap.viewScroll = top;
  return snap;
}

function onBodyKey(p, e) {
  if (e.metaKey && !e.shiftKey && !e.altKey && e.code === "KeyA") {
    e.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(p.linesEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function hasHighlights() {
  return typeof CSS !== "undefined" && CSS.highlights && typeof Highlight === "function";
}

function clearFindHighlights() {
  if (hasHighlights()) { CSS.highlights.delete(FIND_ALL); CSS.highlights.delete(FIND_CUR); }
}

function rangeFor(p, m) {
  const row = lineEl(p, m.line);
  const code = row && row.querySelector(".vl-c");
  if (!code) return null;
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode = null, startOff = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.nodeValue.length;
    if (!startNode && m.start < offset + len) { startNode = node; startOff = m.start - offset; }
    if (startNode && m.end <= offset + len) {
      const r = document.createRange();
      r.setStart(startNode, startOff);
      r.setEnd(node, m.end - offset);
      return r;
    }
    offset += len;
  }
  return null;
}

function paintFind(p) {
  if (!hasHighlights()) return;
  clearFindHighlights();
  const all = p.matches.map((m) => rangeFor(p, m)).filter(Boolean);
  if (all.length) CSS.highlights.set(FIND_ALL, new Highlight(...all));
  const cur = p.matches[p.matchIdx] && rangeFor(p, p.matches[p.matchIdx]);
  if (cur) CSS.highlights.set(FIND_CUR, new Highlight(cur));
}

function firstVisibleLine(p) {
  const first = lineEl(p, 1);
  const h = first ? first.getBoundingClientRect().height : 0;
  return h ? Math.floor(p.view.scrollTop / h) + 1 : 1;
}

function runFind(p, jump) {
  p.matches = findMatches(p.lines, p.findInput.value);
  if (!p.matches.length) p.matchIdx = -1;
  else if (jump || p.matchIdx < 0 || p.matchIdx >= p.matches.length) {
    const from = firstVisibleLine(p);
    const i = p.matches.findIndex((m) => m.line >= from);
    p.matchIdx = i === -1 ? 0 : i;
  }
  updateFind(p, jump);
}

function updateFind(p, scroll) {
  const n = p.matches.length;
  p.findCount.textContent = p.findInput.value ? (n ? `${p.matchIdx + 1}/${n}` : "0/0") : "";
  paintFind(p);
  const m = p.matches[p.matchIdx];
  if (scroll && m) {
    const row = lineEl(p, m.line);
    if (row) row.scrollIntoView({ block: "center" });
    if (!hasHighlights()) {
      const r = rangeFor(p, m);
      if (r) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    }
  }
}

function stepFind(p, dir) {
  if (!p.matches.length) return;
  p.matchIdx = (p.matchIdx + dir + p.matches.length) % p.matches.length;
  updateFind(p, true);
}

export function openViewerFind(p) {
  if (!isViewerPane(p)) return;
  if (findPane && findPane !== p) closeViewerFind(findPane, false);
  findPane = p;
  p.findEl.hidden = false;
  const sel = String(window.getSelection() || "").trim();
  if (sel && !sel.includes("\n")) p.findInput.value = sel;
  p.findInput.focus();
  p.findInput.select();
  if (p.findInput.value) runFind(p, true);
}

export function closeViewerFind(p, refocus = true) {
  p.findEl.hidden = true;
  p.matches = [];
  p.matchIdx = -1;
  if (findPane === p) { clearFindHighlights(); findPane = null; }
  if (refocus) focusPane(p.id);
}

export function toggleViewerFind(p) {
  if (!isViewerPane(p)) return;
  if (!p.findEl.hidden && document.activeElement === p.findInput) closeViewerFind(p);
  else openViewerFind(p);
}

function wireFind(p) {
  p.findInput.addEventListener("mousedown", (e) => e.stopPropagation());
  p.findInput.addEventListener("input", () => runFind(p, true));
  p.findInput.addEventListener("keydown", (e) => {
    if (e.metaKey) return;
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); stepFind(p, e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); closeViewerFind(p); }
  });
  p.findEl.querySelector('[data-find="prev"]').onclick = (e) => { e.stopPropagation(); stepFind(p, -1); };
  p.findEl.querySelector('[data-find="next"]').onclick = (e) => { e.stopPropagation(); stepFind(p, 1); };
  p.findEl.querySelector('[data-find="close"]').onclick = (e) => { e.stopPropagation(); closeViewerFind(p); };
}
