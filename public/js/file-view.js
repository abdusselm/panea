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
import { pushRecent } from "./quick-open-model.js";
import {
  languageFor, textLines, splitHighlighted, plainHtmlLines, lineMarkMap, findMatches, clampLine,
} from "./file-view-model.js";
import { isMarkdownFile, readingStats } from "./markdown.js";
import { buildDoc, loadDocImages, wireDoc, scrollToAnchor, docRanges, needsHighlighter } from "./md-reader.js";
import { loadVendor } from "./vendor-load.js";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RECENT_ROOTS = 20;
const RELOAD_MIN_MS = 1000;
const CHUNK = 200;
const FIND_ALL = "viewer-find";
const FIND_CUR = "viewer-find-current";

const pending = new Map();
const recentByRoot = new Map();
let nextReqId = 1;
let watchedRoot = "";
let findPane = null;

function ensureHighlighter() {
  return loadVendor("/vendor/highlight.js", "hljs");
}

export function recentFiles(root) {
  return recentByRoot.get(root) || [];
}

function noteRecent(root, rel) {
  const next = pushRecent(recentFiles(root), rel);
  recentByRoot.delete(root);
  recentByRoot.set(root, next);
  while (recentByRoot.size > MAX_RECENT_ROOTS) recentByRoot.delete(recentByRoot.keys().next().value);
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

export async function openInViewer({ root, cwd, path, line = 0, hash = "", from = "tree" } = {}) {
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
    splitPane(anchor, "h", { viewer: { data: res, line, hash } });
    return true;
  }
  if (p.hidden) showPane(p.id);
  await show(p, res, { line, hash });
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
    <div class="viewer-sub">
      <span class="viewer-path"></span><span class="viewer-info"></span>
      <span class="viewer-mode" role="group" aria-label="Markdown view" hidden>
        <button data-mode="read" title="Formatted preview (Cmd-Shift-V)">Preview</button>
        <button data-mode="source" title="Raw markdown (Cmd-Shift-V)">Source</button>
      </span>
    </div>
    <div class="viewer-find" hidden>
      <input class="viewer-find-input" spellcheck="false" autocomplete="off" placeholder="Find in file" />
      <span class="viewer-find-count"></span>
      <button data-find="prev" title="Previous (Shift-Enter)">${ICON.chevronUp}</button>
      <button data-find="next" title="Next (Enter)">${ICON.chevronDown}</button>
      <button data-find="close" title="Close (Esc)">${ICON.close}</button>
    </div>
    <div class="viewer-body" tabindex="0"><div class="viewer-lines"></div><div class="viewer-doc" hidden><article class="md-doc"></article></div></div>`;

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
    docWrap: el.querySelector(".viewer-doc"),
    docEl: el.querySelector(".md-doc"),
    modeEl: el.querySelector(".viewer-mode"),
    mode: spec.mdSource ? "source" : "read",
    built: { source: null, read: null },
    marks: null,
    stats: null,
    summary: "",
    paintSeq: 0,
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
  for (const btn of pane.modeEl.querySelectorAll("[data-mode]")) {
    btn.onclick = (e) => { e.stopPropagation(); setMode(pane, btn.dataset.mode); };
  }
  wireDoc(pane, (rel, hash) => openInViewer({ root: pane.root, path: rel, hash }));
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

  if (spec.data) show(pane, spec.data, { line: spec.line, hash: spec.hash });
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
  p.built = { source: null, read: null };
  p.paintSeq++;
  syncModeUi(p);
  p.docEl.replaceChildren();
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

function isMarkdownView(p) {
  return !!(p.data && p.data.content !== undefined && isMarkdownFile(p.rel));
}

function readingMode(p) {
  return isMarkdownView(p) && p.mode === "read";
}

function syncModeUi(p) {
  const md = isMarkdownView(p);
  const reading = md && p.mode === "read";
  p.modeEl.hidden = !md;
  for (const btn of p.modeEl.querySelectorAll("[data-mode]")) {
    const on = btn.dataset.mode === (reading ? "read" : "source");
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  p.view.classList.toggle("reading", reading);
  p.linesEl.hidden = reading;
  p.docWrap.hidden = !reading;
  p.el.querySelector('[data-act="wrap"]').disabled = reading;
}

function refreshInfo(p) {
  const res = p.data;
  const info = [];
  if (res && res.content !== undefined) {
    if (readingMode(p) && p.stats) info.push(p.stats.words + (p.stats.words === 1 ? " word" : " words") + " · " + p.stats.minutes + " min read");
    else info.push(p.lines.length + (p.lines.length === 1 ? " line" : " lines"));
  }
  if (p.summary) info.push(p.summary);
  if (res && res.plain && !readingMode(p)) info.push("plain text (large file)");
  p.infoEl.textContent = info.join(" · ");
}

function setMode(p, mode) {
  if (!isMarkdownView(p) || p.mode === mode) return;
  const max = p.view.scrollHeight - p.view.clientHeight;
  const ratio = max > 0 ? p.view.scrollTop / max : 0;
  p.mode = mode;
  if (findPane === p) clearFindHighlights();
  syncModeUi(p);
  refreshInfo(p);
  paint(p, { ratio });
  persist();
}

export function toggleViewerMode(p) {
  if (!isViewerPane(p) || !isMarkdownView(p)) return;
  setMode(p, p.mode === "read" ? "source" : "read");
}

async function show(p, res, { line = 0, keepScroll = false, scroll = 0, hash = "" } = {}) {
  const prevTop = p.view.scrollTop;
  const prevLeft = p.view.scrollLeft;
  const sameText = p.data && res.content !== undefined && p.data.content === res.content && p.data.rel === res.rel;
  if (res.rel && res.rel !== p.rel) p.built = { source: null, read: null };
  if ((res.rel && res.rel !== p.rel) || line) p.mode = line ? "source" : "read";
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
  p.summary = changeSummary(res, kinds, dels);
  p.el.querySelector('[data-act="changes"]').disabled = !p.summary;

  if (res.content === undefined || note) {
    p.data = res;
    p.lines = lines;
    p.stats = null;
    refreshInfo(p);
    message(p, note);
    return;
  }
  if (p.root && p.rel) noteRecent(p.root, p.rel);

  p.data = res;
  p.lines = lines;
  p.marks = { kinds, dels };
  if (!sameText) p.stats = isMarkdownFile(p.rel) ? readingStats(res.content) : null;
  syncModeUi(p);
  refreshInfo(p);

  if (sameText && p.built[readingMode(p) ? "read" : "source"] === res.content) {
    if (p.built.source === res.content) applyMarks(p, kinds, dels);
    if (line) requestAnimationFrame(() => revealLine(p, line));
    if (hash) requestAnimationFrame(() => scrollToAnchor(p, hash));
    return;
  }
  await paint(p, { line, keepScroll, prevTop, prevLeft, scroll, hash });
}

async function sourceHtml(p, res) {
  const lang = res.plain ? "" : languageFor(res.rel);
  let htmlLines = null;
  if (lang) {
    const hljs = await ensureHighlighter();
    if (hljs && hljs.getLanguage(lang)) {
      try { htmlLines = splitHighlighted(hljs.highlight(res.content, { language: lang, ignoreIllegals: true }).value, res.content); }
      catch (_) { htmlLines = null; }
    }
  }
  if (!htmlLines || htmlLines.length !== p.lines.length) htmlLines = plainHtmlLines(res.content);
  return buildHtml(htmlLines, p.marks.kinds, p.marks.dels, clampLine(p.hlLine, p.lines.length));
}

async function paint(p, { line = 0, keepScroll = false, prevTop = 0, prevLeft = 0, scroll = 0, hash = "", ratio = null } = {}) {
  const res = p.data;
  if (!res || res.content === undefined) return;
  const seq = ++p.paintSeq;
  const live = () => seq === p.paintSeq && state.panes.has(p.id) && p.data === res;
  if (readingMode(p)) {
    if (p.built.read !== res.content) {
      const hljs = needsHighlighter(res.content) ? await ensureHighlighter() : null;
      const frag = await buildDoc(res.content, hljs);
      if (!live()) return;
      if (!frag) { p.mode = "source"; syncModeUi(p); refreshInfo(p); return paint(p, { line, scroll, ratio }); }
      p.docEl.replaceChildren(frag);
      p.built.read = res.content;
      loadDocImages(p);
    }
  } else if (p.built.source !== res.content) {
    const html = await sourceHtml(p, res);
    if (!live()) return;
    p.linesEl.innerHTML = html;
    p.built.source = res.content;
  }
  if (findPane === p && !p.findEl.hidden) runFind(p, false);

  requestAnimationFrame(() => {
    if (!live()) return;
    if (ratio !== null) p.view.scrollTop = ratio * Math.max(0, p.view.scrollHeight - p.view.clientHeight);
    else if (keepScroll) { p.view.scrollTop = prevTop; p.view.scrollLeft = prevLeft; }
    else if (scroll) p.view.scrollTop = scroll;
    else p.view.scrollTop = 0;
    if (line) revealLine(p, line);
    if (hash && readingMode(p)) scrollToAnchor(p, hash);
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
  if (p.mode === "source" && isMarkdownFile(p.rel)) snap.mdSource = true;
  const top = Math.round(p.scrollTop || 0);
  if (top) snap.viewScroll = top;
  return snap;
}

function onBodyKey(p, e) {
  if (e.metaKey && !e.shiftKey && !e.altKey && e.code === "KeyA") {
    e.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(readingMode(p) ? p.docEl : p.linesEl);
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
  if (m instanceof Range) return m;
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

function firstMatchInView(p) {
  if (readingMode(p)) {
    const top = p.view.getBoundingClientRect().top;
    return p.matches.findIndex((r) => r.getBoundingClientRect().top >= top);
  }
  const from = firstVisibleLine(p);
  return p.matches.findIndex((m) => m.line >= from);
}

function runFind(p, jump) {
  p.matches = readingMode(p) ? docRanges(p.docEl, p.findInput.value) : findMatches(p.lines, p.findInput.value);
  if (!p.matches.length) p.matchIdx = -1;
  else if (jump || p.matchIdx < 0 || p.matchIdx >= p.matches.length) {
    const i = firstMatchInView(p);
    p.matchIdx = i === -1 ? 0 : i;
  }
  updateFind(p, jump);
}

function revealMatch(p, m) {
  const el = m instanceof Range ? m.startContainer.parentElement : lineEl(p, m.line);
  if (el) el.scrollIntoView({ block: "center" });
}

function updateFind(p, scroll) {
  const n = p.matches.length;
  p.findCount.textContent = p.findInput.value ? (n ? `${p.matchIdx + 1}/${n}` : "0/0") : "";
  paintFind(p);
  const m = p.matches[p.matchIdx];
  if (scroll && m) {
    revealMatch(p, m);
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
