// Git diff panel: an overlay scoped to the active tab's repo. Left column lists
// changed files (git status) with per-file +/− counts; clicking one shows its
// unified diff on the right, color-coded. Read-only — panea never mutates the
// tree. Follows the notifications.js panel pattern (overlay + ensureDom +
// open/close/toggle). Data comes over the socket on demand: getGitStatus on
// open/refresh, getGitDiff per file click (see server/git.js). Nothing polls.

import { state, focusedPane } from "./state.js";
import { firstLeaf } from "./util.js";
import { wsSend } from "./ws.js";

let panelEl = null, headEl = null, filesEl = null, diffEl = null;

// Panel state for the repo currently shown. `cwd` doubles as the request token:
// a late gitStatus/gitDiff reply for a different cwd is ignored, so switching
// tabs and reopening can't paint stale files.
let curCwd = "";
let curBranch = "";
let files = [];
let selected = null; // path of the row whose diff is shown

// The repo the panel should target: the focused pane's cwd if it's in the
// active tab, otherwise the active tab's first pane. Empty when there's no tab.
function activeCwd() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return "";
  const fp = focusedPane();
  if (fp && fp.tabId === tab.id && fp.meta && fp.meta.cwd) return fp.meta.cwd;
  const leaf = firstLeaf(tab.tree);
  const p = leaf && state.panes.get(leaf.id);
  return (p && p.meta && p.meta.cwd) || "";
}

function ensureDom() {
  if (panelEl) return;
  panelEl = document.createElement("div");
  panelEl.id = "git-panel";
  panelEl.innerHTML =
    '<div class="git-box">' +
    '<div class="git-head"><span class="git-title"></span>' +
    '<span class="git-actions"><button class="git-refresh">Refresh</button>' +
    '<button class="git-close">Close</button></span></div>' +
    '<div class="git-body"><div class="gd-files"></div><div class="gd-diff"></div></div>' +
    "</div>";
  document.body.appendChild(panelEl);
  headEl = panelEl.querySelector(".git-title");
  filesEl = panelEl.querySelector(".gd-files");
  diffEl = panelEl.querySelector(".gd-diff");
  panelEl.addEventListener("mousedown", (e) => { if (e.target === panelEl) close(); });
  panelEl.querySelector(".git-close").onclick = () => close();
  panelEl.querySelector(".git-refresh").onclick = () => request();
  panelEl.addEventListener("keydown", onKey);
  panelEl.tabIndex = -1;
}

// Ask the server for status of the current repo. Also used by Refresh.
function request() {
  if (!curCwd) return;
  filesEl.innerHTML = '<div class="gd-empty">Loading…</div>';
  diffEl.innerHTML = "";
  selected = null;
  wsSend({ type: "getGitStatus", cwd: curCwd });
}

// ---- inbound (from ws.js dispatch) ----------------------------------------

export function setGitStatus(msg) {
  if (!panelEl || msg.cwd !== curCwd) return; // stale / different repo
  curBranch = msg.branch || "";
  files = msg.repo ? (msg.files || []) : null; // null marks "not a repo"
  renderHead();
  renderFiles();
  // Auto-open the first file's diff so the panel isn't blank on arrival.
  if (files && files.length) selectFile(files[0].path);
  else diffEl.innerHTML = "";
}

export function setGitDiff(msg) {
  if (!panelEl || msg.cwd !== curCwd || msg.path !== selected) return;
  renderDiff(msg.patch || "");
}

// ---- rendering ------------------------------------------------------------

function renderHead() {
  headEl.textContent = "Git";
  if (files === null) return;
  const b = curBranch ? " · " + curBranch : "";
  const n = files.length;
  headEl.textContent = "Git" + b + (n ? "  ·  " + n + (n === 1 ? " change" : " changes") : "");
}

// A short status word + tint for a file's state.
function kindLabel(f) {
  if (f.kind === "untracked") return "new";
  if (f.x === "D" || f.y === "D") return "deleted";
  if (f.x === "R") return "renamed";
  if (f.kind === "staged") return "staged";
  return "modified";
}

function countText(f) {
  if (f.kind === "untracked") return "new";
  if (f.add === null) return "binary";
  return "+" + (f.add || 0) + "  −" + (f.del || 0);
}

function renderFiles() {
  filesEl.innerHTML = "";
  if (files === null) {
    filesEl.innerHTML = '<div class="gd-empty">Not a git repository</div>';
    return;
  }
  if (!files.length) {
    filesEl.innerHTML = '<div class="gd-empty">Working tree clean</div>';
    return;
  }
  for (const f of files) {
    const row = document.createElement("div");
    row.className = "gd-file" + (f.path === selected ? " sel" : "");
    row.dataset.path = f.path;
    const slash = f.path.lastIndexOf("/");
    const dir = slash >= 0 ? f.path.slice(0, slash + 1) : "";
    const base = slash >= 0 ? f.path.slice(slash + 1) : f.path;
    row.innerHTML =
      '<span class="gd-dot" data-kind="' + kindLabel(f) + '"></span>' +
      '<span class="gd-path"><span class="gd-dir"></span><span class="gd-base"></span></span>' +
      '<span class="gd-count"></span>';
    row.querySelector(".gd-dir").textContent = dir;
    row.querySelector(".gd-base").textContent = base;
    const cnt = row.querySelector(".gd-count");
    cnt.textContent = countText(f);
    cnt.dataset.kind = kindLabel(f);
    row.onclick = () => selectFile(f.path);
    filesEl.appendChild(row);
  }
}

function selectFile(path) {
  const f = files && files.find((x) => x.path === path);
  if (!f) return;
  selected = path;
  for (const row of filesEl.querySelectorAll(".gd-file")) {
    row.classList.toggle("sel", row.dataset.path === path);
  }
  const sel = filesEl.querySelector(".gd-file.sel");
  if (sel) sel.scrollIntoView({ block: "nearest" });
  diffEl.innerHTML = '<div class="gd-empty">Loading diff…</div>';
  wsSend({ type: "getGitDiff", cwd: curCwd, path, mode: f.kind });
}

// Cap on rendered diff lines. One <div> per line means a pathological 10k-line
// diff would spawn 10k DOM nodes at once; beyond this we render a slice and note
// the remainder. A diff that large belongs in the terminal, not a glance panel.
const MAX_DIFF_LINES = 2000;

// Render a unified diff: skip the file-header preamble, keep hunk headers and
// +/−/context lines, color-coded. textContent per line escapes everything.
// Only the DOM slice up to MAX_DIFF_LINES is materialized.
function renderDiff(patch) {
  diffEl.innerHTML = "";
  // Collect renderable lines first (cheap strings): drop the "diff --git /
  // index / --- / +++ / new file …" preamble before the first hunk. DOM cost is
  // paid only for the capped slice below.
  const rows = [];
  let sawHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) sawHunk = true;
    if (!sawHunk) continue;
    let cls = "dl-ctx";
    if (line.startsWith("@@")) cls = "dl-hunk";
    else if (line.startsWith("+")) cls = "dl-add";
    else if (line.startsWith("-")) cls = "dl-del";
    rows.push({ cls, text: line || " " });
  }
  if (!rows.length) {
    diffEl.innerHTML = '<div class="gd-empty">No textual diff</div>';
    return;
  }
  const pre = document.createElement("div");
  pre.className = "gd-diffbody";
  const shown = Math.min(rows.length, MAX_DIFF_LINES);
  for (let i = 0; i < shown; i++) {
    const el = document.createElement("div");
    el.className = "gd-line " + rows[i].cls;
    el.textContent = rows[i].text;
    pre.appendChild(el);
  }
  diffEl.appendChild(pre);
  if (rows.length > shown) {
    const more = document.createElement("div");
    more.className = "gd-truncated";
    more.textContent = "… " + (rows.length - shown) + " more lines — open the file to see the full diff";
    diffEl.appendChild(more);
  }
  diffEl.scrollTop = 0;
}

// ---- keyboard: ↑/↓ move file selection, Esc closes -----------------------

function onKey(e) {
  if (e.key === "Escape") { e.preventDefault(); close(); return; }
  if (!files || !files.length) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const idx = files.findIndex((f) => f.path === selected);
  const next = e.key === "ArrowDown"
    ? Math.min(files.length - 1, idx + 1)
    : Math.max(0, idx - 1);
  if (files[next]) selectFile(files[next].path);
}

// ---- open / close ---------------------------------------------------------

export function isOpen() { return panelEl && panelEl.classList.contains("open"); }

export function openGit() {
  ensureDom();
  curCwd = activeCwd();
  curBranch = "";
  files = [];
  selected = null;
  panelEl.classList.add("open");
  panelEl.focus();
  if (!curCwd) {
    files = null;
    renderHead();
    renderFiles();
    diffEl.innerHTML = "";
    return;
  }
  request();
}

function close() { if (panelEl) panelEl.classList.remove("open"); }
export function closeGit() { close(); }
export function toggleGit() { isOpen() ? close() : openGit(); }
