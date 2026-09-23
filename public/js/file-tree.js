import { state, runtime, activeCwd } from "./state.js";
import { enc, u8ToB64 } from "./util.js";
import { ICON } from "./theme.js";
import { wsSend } from "./ws.js";
import { persist } from "./session.js";
import { focusPane, splitPane } from "./panes.js";
import { newTab } from "./tabs.js";
import { isTerminalPane } from "./pane-kind.js";
import { openMdPreview } from "./md-preview.js";
import { openGit } from "./git.js";
import { openInViewer } from "./file-view.js";
import {
  parentRel, decorate, shellQuote, absPath, pathForPane, flattenTree,
  openDirs, pruneExpanded, clampPanelWidth, baseName,
} from "./file-tree-model.js";
import { noteFeatureUsed } from "./feature-use.js";

const DRAG_TYPE = "application/x-panea-path";
const REFRESH_MIN_MS = 1000;
const MAX_ROOTS = 20;

let panelEl = null, listEl = null, titleEl = null, resizerEl = null, placeholderEl = null;
let menuEl = null, dropEl = null;

const cur = { cwd: "", root: "", repo: false };
let listings = new Map();
let expanded = new Set();
const expandedByRoot = new Map();
let deco = { files: new Map(), dirs: new Set() };
const rowEls = new Map();
let rows = [];
let rowByRel = new Map();
let selectedRel = "";
let refreshTimer = null;
let lastRefresh = 0;
let renderRAF = 0;

function ensureDom() {
  if (panelEl) return;
  panelEl = document.createElement("aside");
  panelEl.id = "files-panel";
  panelEl.hidden = true;
  panelEl.innerHTML =
    '<div class="ft-head"><span class="ft-title">Files</span><span class="ft-actions">' +
    '<button class="ft-collapse" title="Collapse folders">' + ICON.collapse + "</button>" +
    '<button class="ft-refresh" title="Refresh">' + ICON.reload + "</button>" +
    '<button class="ft-close" title="Close">' + ICON.close + "</button>" +
    '</span></div><div class="ft-list" role="tree" tabindex="0"></div>';
  resizerEl = document.createElement("div");
  resizerEl.id = "files-resizer";
  resizerEl.hidden = true;
  resizerEl.title = "Drag to resize files";
  const workspace = document.getElementById("workspace");
  workspace.before(panelEl, resizerEl);
  titleEl = panelEl.querySelector(".ft-title");
  listEl = panelEl.querySelector(".ft-list");
  panelEl.querySelector(".ft-collapse").onclick = collapseAll;
  panelEl.querySelector(".ft-refresh").onclick = () => refresh();
  panelEl.querySelector(".ft-close").onclick = () => closeFileTree();
  listEl.addEventListener("click", onClick);
  listEl.addEventListener("dblclick", onDblClick);
  listEl.addEventListener("contextmenu", onContextMenu);
  listEl.addEventListener("keydown", onKey);
  listEl.addEventListener("dragstart", onDragStart);
  wireResize();
  wireWorkspaceDrop(workspace);
}

function applyWidth(w) {
  runtime.filesPanel.w = clampPanelWidth(w);
  document.documentElement.style.setProperty("--files-w", runtime.filesPanel.w + "px");
}

function wireResize() {
  resizerEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const left = panelEl.getBoundingClientRect().left;
    resizerEl.classList.add("dragging");
    document.body.classList.add("resizing-sidebar");
    document.body.style.cursor = "col-resize";
    const onMove = (ev) => applyWidth(ev.clientX - left);
    const onUp = () => {
      resizerEl.classList.remove("dragging");
      document.body.classList.remove("resizing-sidebar");
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      persist();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

export function isFileTreeOpen() {
  return !!panelEl && !panelEl.hidden;
}

export function openFileTree({ focus = true } = {}) {
  ensureDom();
  noteFeatureUsed("files");
  applyWidth(runtime.filesPanel.w);
  panelEl.hidden = false;
  resizerEl.hidden = false;
  if (!runtime.filesPanel.open) {
    runtime.filesPanel.open = true;
    persist();
  }
  syncTreeRoot(true);
  if (focus) listEl.focus();
}

export function closeFileTree() {
  if (!isFileTreeOpen()) return;
  const hadFocus = panelEl.contains(document.activeElement);
  panelEl.hidden = true;
  resizerEl.hidden = true;
  closeMenu();
  clearTimeout(refreshTimer);
  refreshTimer = null;
  wsSend({ type: "unwatchTree" });
  resetRoot();
  cur.cwd = "";
  runtime.filesPanel.open = false;
  persist();
  if (hadFocus && state.focusedPaneId) focusPane(state.focusedPaneId);
}

export function toggleFileTree() {
  if (!isFileTreeOpen()) return openFileTree();
  if (panelEl.contains(document.activeElement)) return closeFileTree();
  listEl.focus();
}

export function restoreFileTree(saved) {
  if (!saved) return;
  if (Number(saved.w) > 0) runtime.filesPanel.w = clampPanelWidth(saved.w);
  if (!saved.open) return;
  runtime.filesPanel.open = true;
  openFileTree({ focus: false });
}

export function fileTreeReconnected() {
  if (!isFileTreeOpen() || !cur.root) return;
  if (cur.repo) wsSend({ type: "watchTree", root: cur.root });
  refresh();
}

function resetRoot() {
  cancelAnimationFrame(renderRAF);
  renderRAF = 0;
  cur.root = "";
  cur.repo = false;
  listings = new Map();
  deco = { files: new Map(), dirs: new Set() };
  rows = [];
  rowByRel = new Map();
  rowEls.clear();
  selectedRel = "";
  placeholderEl = null;
  if (listEl) listEl.textContent = "";
}

function expandedFor(root) {
  let set = expandedByRoot.get(root);
  if (set) expandedByRoot.delete(root);
  else set = new Set();
  expandedByRoot.set(root, set);
  while (expandedByRoot.size > MAX_ROOTS) expandedByRoot.delete(expandedByRoot.keys().next().value);
  return set;
}

export function syncTreeRoot(force) {
  if (!isFileTreeOpen()) return;
  const cwd = activeCwd();
  if (!force && cwd === cur.cwd) return;
  cur.cwd = cwd;
  if (!cwd) { showRootless(); return; }
  wsSend({ type: "getTreeRoot", cwd });
}

function showRootless() {
  if (cur.root) wsSend({ type: "unwatchTree" });
  resetRoot();
  titleEl.textContent = "Files";
  titleEl.title = "";
  placeholder("No folder for this pane yet");
}

export function setTreeRoot(msg) {
  if (!isFileTreeOpen() || msg.cwd !== cur.cwd) return;
  if (!msg.root) { showRootless(); return; }
  if (msg.root === cur.root) return;
  resetRoot();
  cur.root = msg.root;
  cur.repo = !!msg.repo;
  expanded = expandedFor(cur.root);
  titleEl.textContent = baseName(cur.root);
  titleEl.title = cur.root;
  listEl.scrollTop = 0;
  placeholder("Loading…");
  wsSend(cur.repo ? { type: "watchTree", root: cur.root } : { type: "unwatchTree" });
  refresh();
}

function refresh(dirs) {
  if (!cur.root) return;
  lastRefresh = Date.now();
  wsSend({ type: "listTree", root: cur.root, repo: cur.repo, dirs: dirs || openDirs(expanded) });
  if (cur.repo && !dirs) wsSend({ type: "getTreeStatus", root: cur.root });
}

function scheduleRefresh() {
  if (refreshTimer) return;
  const wait = Math.max(0, lastRefresh + REFRESH_MIN_MS - Date.now());
  refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, wait);
}

export function treeChanged(msg) {
  if (!isFileTreeOpen() || msg.root !== cur.root) return;
  scheduleRefresh();
}

export function setTreeEntries(msg) {
  if (!isFileTreeOpen() || msg.root !== cur.root) return;
  for (const [rel, listing] of Object.entries(msg.dirs || {})) {
    if (listing && listing.entries) listings.set(rel, listing);
    else if (rel) { listings.delete(rel); pruneExpanded(expanded, rel); }
    else listings.set("", { entries: [], truncated: 0, error: (listing && listing.error) || "unreadable" });
  }
  for (const rel of listings.keys()) if (rel && !expanded.has(rel)) listings.delete(rel);
  scheduleRender();
}

export function setTreeStatus(msg) {
  if (!isFileTreeOpen() || msg.root !== cur.root) return;
  deco = decorate(msg.files);
  scheduleRender();
}

function scheduleRender() {
  if (renderRAF) return;
  renderRAF = requestAnimationFrame(() => { renderRAF = 0; render(); });
}

function placeholder(text) {
  if (!placeholderEl) {
    rowEls.clear();
    rows = [];
    rowByRel = new Map();
    listEl.textContent = "";
    placeholderEl = document.createElement("div");
    placeholderEl.className = "ft-empty";
    listEl.appendChild(placeholderEl);
  }
  placeholderEl.textContent = text;
}

function render() {
  if (!listEl || !cur.root) return;
  const root = listings.get("");
  if (!root) return;
  if (root.error) return placeholder("Could not read this folder");
  const next = flattenTree(listings, expanded);
  if (!next.length) return placeholder("Empty folder");
  if (placeholderEl) { placeholderEl.remove(); placeholderEl = null; }
  rows = next;
  rowByRel = new Map();
  let prev = null;
  for (const row of rows) {
    rowByRel.set(row.rel, row);
    let el = rowEls.get(row.rel);
    if (!el) { el = createRow(row); rowEls.set(row.rel, el); }
    patchRow(el, row);
    const want = prev ? prev.nextSibling : listEl.firstChild;
    if (el !== want) listEl.insertBefore(el, want);
    prev = el;
  }
  for (const [rel, el] of rowEls) if (!rowByRel.has(rel)) { el.remove(); rowEls.delete(rel); }
  if (selectedRel && !rowByRel.has(selectedRel)) selectedRel = "";
}

function createRow(row) {
  const el = document.createElement("div");
  el.className = "ft-row";
  if (row.more) {
    el.classList.add("ft-more");
    return el;
  }
  el.dataset.rel = row.rel;
  el.draggable = true;
  el.setAttribute("role", "treeitem");
  el.innerHTML = '<span class="ft-twisty"></span><span class="ft-name"></span><span class="ft-badge"></span>';
  return el;
}

function patchRow(el, row) {
  if (row.more) {
    el.style.setProperty("--depth", row.depth);
    el.textContent = row.more + " more not shown";
    return;
  }
  const st = row.dir ? "" : deco.files.get(row.rel) || "";
  const changed = row.dir && deco.dirs.has(row.rel);
  const key = [row.name, row.type, row.depth, row.open, row.loading, row.ignored, row.outside, st, changed].join("|");
  if (el.ftKey !== key) {
    el.ftKey = key;
    el.style.setProperty("--depth", row.depth);
    el.classList.toggle("dir", row.dir);
    el.classList.toggle("open", row.open);
    el.classList.toggle("loading", row.loading);
    el.classList.toggle("ignored", row.ignored);
    el.classList.toggle("outside", row.outside);
    el.classList.toggle("link", row.type.startsWith("link"));
    el.classList.toggle("changed", changed);
    if (st) el.dataset.st = st;
    else delete el.dataset.st;
    if (row.dir) el.setAttribute("aria-expanded", String(row.open));
    else el.removeAttribute("aria-expanded");
    el.children[1].textContent = row.name;
    el.children[2].textContent = st;
    el.title = row.outside ? "Links outside this folder" : "";
  }
  el.classList.toggle("sel", row.rel === selectedRel);
}

function select(rel, reveal) {
  if (selectedRel !== rel) {
    const old = rowEls.get(selectedRel);
    if (old) old.classList.remove("sel");
    selectedRel = rel;
  }
  const el = rowEls.get(rel);
  if (!el) return;
  el.classList.add("sel");
  if (reveal) el.scrollIntoView({ block: "nearest" });
}

function rowFromEvent(e) {
  const el = e.target.closest && e.target.closest(".ft-row");
  return el && el.dataset.rel !== undefined ? rowByRel.get(el.dataset.rel) || null : null;
}

function toggleDir(row) {
  if (!row.dir || row.outside) return;
  if (expanded.has(row.rel)) {
    expanded.delete(row.rel);
    scheduleRender();
    return;
  }
  expanded.add(row.rel);
  scheduleRender();
  refresh(openDirs(expanded).filter((d) => d === row.rel || d.startsWith(row.rel + "/")));
}

function collapseAll() {
  expanded.clear();
  for (const rel of listings.keys()) if (rel) listings.delete(rel);
  scheduleRender();
}

export function typePath(root, rel, paneId) {
  const p = state.panes.get(paneId || state.focusedPaneId);
  if (!isTerminalPane(p) || p.exited || !root) return false;
  const text = shellQuote(pathForPane(root, rel, p.meta && p.meta.cwd)) + " ";
  wsSend({ type: "input", paneId: p.id, data: u8ToB64(enc.encode(text)) });
  focusPane(p.id);
  return true;
}

function insertPath(rel, paneId) {
  typePath(cur.root, rel, paneId);
}

function openPaneAt(abs) {
  const id = state.focusedPaneId;
  if (id && state.panes.has(id)) splitPane(id, "h", { cwd: abs });
  else newTab(abs);
}

function copy(text) {
  try { navigator.clipboard.writeText(text).catch(() => {}); } catch (_) {}
}

function onClick(e) {
  const row = rowFromEvent(e);
  if (!row) return;
  select(row.rel);
  if (row.dir) toggleDir(row);
}

function openFile(rel) {
  openInViewer({ root: cur.root, path: rel });
}

function onDblClick(e) {
  const row = rowFromEvent(e);
  if (!row || row.dir) return;
  if (e.altKey) insertPath(row.rel);
  else openFile(row.rel);
}

function moveSel(i, step) {
  for (let j = i + step; j >= 0 && j < rows.length; j += step) {
    if (!rows[j].more) { select(rows[j].rel, true); return; }
  }
}

function onKey(e) {
  if (e.metaKey || e.ctrlKey) return;
  const i = rows.findIndex((r) => r.rel === selectedRel);
  const row = i === -1 ? null : rows[i];
  switch (e.key) {
    case "ArrowDown": moveSel(i, 1); break;
    case "ArrowUp": moveSel(i === -1 ? rows.length : i, -1); break;
    case "ArrowRight":
      if (!row) moveSel(-1, 1);
      else if (row.dir && !row.open) toggleDir(row);
      else if (row.open) moveSel(i, 1);
      break;
    case "ArrowLeft":
      if (row && row.open) toggleDir(row);
      else if (row && parentRel(row.rel)) select(parentRel(row.rel), true);
      break;
    case "Enter":
      if (row && row.dir) toggleDir(row);
      else if (row && e.altKey) insertPath(row.rel);
      else if (row) openFile(row.rel);
      break;
    case "Escape":
      if (state.focusedPaneId) focusPane(state.focusedPaneId);
      break;
    default:
      return;
  }
  e.preventDefault();
}

function menuItems(row) {
  const abs = absPath(cur.root, row.rel);
  const items = [];
  if (row.dir && !row.outside) {
    items.push(["New pane here", () => openPaneAt(abs)]);
    items.push(["New tab here", () => newTab(abs)]);
  }
  if (!row.dir) {
    items.push(["Open", () => openFile(row.rel)]);
    items.push(["Insert path", () => insertPath(row.rel)]);
    if (/\.md$/i.test(row.name)) items.push(["Preview", () => openMdPreview(row.rel, cur.root)]);
    if (deco.files.has(row.rel)) items.push(["Show diff", () => openGit({ cwd: cur.root, select: row.rel })]);
  }
  items.push(["Copy relative path", () => copy(row.rel)]);
  items.push(["Copy path", () => copy(abs)]);
  items.push(["Reveal in Finder", () => wsSend({ type: "revealPath", root: cur.root, path: row.rel })]);
  return items;
}

function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener("mousedown", onMenuDocDown, true);
}

function onMenuDocDown(e) {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
}

function onContextMenu(e) {
  const row = rowFromEvent(e);
  if (!row) return;
  e.preventDefault();
  select(row.rel);
  closeMenu();
  menuEl = document.createElement("div");
  menuEl.className = "ctx-menu";
  for (const [label, run] of menuItems(row)) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => { closeMenu(); run(); };
    menuEl.appendChild(b);
  }
  document.body.appendChild(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - r.width - 4)) + "px";
  menuEl.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - r.height - 4)) + "px";
  document.addEventListener("mousedown", onMenuDocDown, true);
}

function onDragStart(e) {
  const row = rowFromEvent(e);
  if (!row) return;
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData(DRAG_TYPE, row.rel);
  e.dataTransfer.setData("text/plain", absPath(cur.root, row.rel));
}

function dropPane(e) {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes(DRAG_TYPE)) return null;
  const leaf = e.target.closest && e.target.closest(".leaf");
  const p = leaf && state.panes.get(leaf.dataset.paneId);
  return isTerminalPane(p) && !p.exited ? p : null;
}

function setDropTarget(el) {
  if (dropEl === el) return;
  if (dropEl) dropEl.classList.remove("ft-drop");
  dropEl = el;
  if (dropEl) dropEl.classList.add("ft-drop");
}

function wireWorkspaceDrop(workspace) {
  workspace.addEventListener("dragover", (e) => {
    const p = dropPane(e);
    setDropTarget(p ? p.el : null);
    if (!p) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  workspace.addEventListener("dragleave", (e) => {
    if (!workspace.contains(e.relatedTarget)) setDropTarget(null);
  });
  workspace.addEventListener("drop", (e) => {
    const p = dropPane(e);
    setDropTarget(null);
    if (!p) return;
    e.preventDefault();
    insertPath(e.dataTransfer.getData(DRAG_TYPE), p.id);
  });
  document.addEventListener("dragend", () => setDropTarget(null));
}
