import { activeCwd, focusedPane } from "./state.js";
import { wsSend } from "./ws.js";
import { openInViewer, recentFiles } from "./file-view.js";
import { typePath } from "./file-tree.js";
import { prepare, rankFiles, parseQuery, splitHighlight, baseStart } from "./quick-open-model.js";
import { noteFeatureUsed } from "./feature-use.js";

const MAX_CACHED_ROOTS = 5;

let overlayEl = null, inputEl = null, listEl = null, statusEl = null;
let reqSeq = 0;
let liveReq = 0;
let cur = { root: "", cwd: "", prepared: prepare([]), truncated: false, loading: false, error: "" };
let results = [];
let rowEls = [];
let index = 0;
let pendingChoice = null;
const cache = new Map();
const rootByCwd = new Map();

function ensureDom() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "quick-open";
  overlayEl.innerHTML =
    '<div class="palette-box">' +
    '<input class="palette-input" type="text" placeholder="Go to file… (add :line to jump)" spellcheck="false" autocomplete="off" />' +
    '<div class="qo-status"></div>' +
    '<div class="palette-list"></div></div>';
  document.body.appendChild(overlayEl);
  inputEl = overlayEl.querySelector(".palette-input");
  listEl = overlayEl.querySelector(".palette-list");
  statusEl = overlayEl.querySelector(".qo-status");
  overlayEl.addEventListener("mousedown", (e) => { if (e.target === overlayEl) closeQuickOpen(); });
  inputEl.addEventListener("input", () => render());
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(e.altKey); }
    else if (e.key === "Escape") { e.preventDefault(); closeQuickOpen(); }
  });
}

export function isQuickOpenOpen() {
  return !!overlayEl && overlayEl.classList.contains("open");
}

export function openQuickOpen() {
  ensureDom();
  noteFeatureUsed("quick-open");
  const cwd = activeCwd();
  const known = rootByCwd.get(cwd);
  const cached = known && cache.get(known);
  cur = cached
    ? { ...cached, cwd, loading: true, error: "" }
    : { root: "", cwd, prepared: prepare([]), truncated: false, loading: !!cwd, error: cwd ? "" : "no project" };
  overlayEl.classList.add("open");
  pendingChoice = null;
  inputEl.value = "";
  render();
  inputEl.focus();
  if (!cwd) return;
  liveReq = ++reqSeq;
  wsSend({ type: "listFiles", reqId: liveReq, cwd });
}

export function closeQuickOpen() {
  if (!isQuickOpenOpen()) return;
  overlayEl.classList.remove("open");
  liveReq = 0;
  pendingChoice = null;
  const p = focusedPane();
  const surface = p && (p.term || p.view);
  if (surface) surface.focus();
}

export function toggleQuickOpen() {
  if (isQuickOpenOpen()) closeQuickOpen();
  else openQuickOpen();
}

export function setFileList(msg) {
  if (!isQuickOpenOpen() || msg.reqId !== liveReq) return;
  liveReq = 0;
  if (msg.error || !msg.root) {
    pendingChoice = null;
    cur = { ...cur, loading: false, error: cur.root ? "" : msg.error || "no project" };
    render();
    return;
  }
  const entry = { root: msg.root, prepared: prepare(msg.files || []), truncated: !!msg.truncated };
  rootByCwd.set(cur.cwd, msg.root);
  cache.delete(msg.root);
  cache.set(msg.root, entry);
  while (cache.size > MAX_CACHED_ROOTS) cache.delete(cache.keys().next().value);
  if (rootByCwd.size > 50) rootByCwd.delete(rootByCwd.keys().next().value);
  cur = { ...entry, cwd: cur.cwd, loading: false, error: "" };
  render();
  if (pendingChoice) choose(pendingChoice.typeInstead);
}

function status() {
  if (cur.error && !cur.root) return "No folder for this pane yet";
  if (!cur.root) return cur.loading ? "Loading files…" : "";
  const n = cur.prepared.files.length;
  const count = n.toLocaleString() + (cur.truncated ? "+" : "") + (n === 1 ? " file" : " files");
  return (cur.loading ? "Refreshing · " : "") + count + " in " + cur.root.split("/").pop();
}

function appendParts(el, parts) {
  for (const part of parts) {
    if (part.match) {
      const b = document.createElement("b");
      b.className = "qo-hit";
      b.textContent = part.text;
      el.appendChild(b);
    } else {
      el.appendChild(document.createTextNode(part.text));
    }
  }
}

function render() {
  const { text } = parseQuery(inputEl.value);
  results = cur.root ? rankFiles(cur.prepared, text, { recent: recentFiles(cur.root) }) : [];
  statusEl.textContent = status();
  listEl.textContent = "";
  rowEls = [];
  results.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "palette-item qo-item";
    const start = baseStart(r.path);
    const name = document.createElement("span");
    name.className = "pi-title";
    appendParts(name, splitHighlight(r.path.slice(start), r.positions, start));
    const dir = document.createElement("span");
    dir.className = "pi-hint qo-dir";
    appendParts(dir, splitHighlight(r.path.slice(0, start), r.positions, 0));
    row.append(name, dir);
    row.onmousemove = () => select(i);
    row.onclick = (e) => { select(i); choose(e.altKey); };
    listEl.appendChild(row);
    rowEls.push(row);
  });
  index = 0;
  if (rowEls.length) rowEls[0].classList.add("sel");
  else if (cur.root && !cur.loading) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = text ? "No matching files" : "No files";
    listEl.appendChild(empty);
  }
}

function select(i) {
  if (i === index || !rowEls[i]) return;
  if (rowEls[index]) rowEls[index].classList.remove("sel");
  index = i;
  rowEls[i].classList.add("sel");
}

function move(delta) {
  if (!rowEls.length) return;
  select((index + delta + rowEls.length) % rowEls.length);
  rowEls[index].scrollIntoView({ block: "nearest" });
}

function choose(typeInstead) {
  const hit = results[index];
  if (!hit && cur.loading && !cur.root) { pendingChoice = { typeInstead }; return; }
  pendingChoice = null;
  if (!hit || !cur.root) return;
  const { line } = parseQuery(inputEl.value);
  const root = cur.root;
  closeQuickOpen();
  if (typeInstead) typePath(root, hit.path);
  else openInViewer({ root, path: hit.path, line });
}
