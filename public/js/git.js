

import { activeCwd } from "./state.js";
import { wsSend } from "./ws.js";
import { initGitResize, applyGitPanelSize } from "./git-resize.js";
import {
  mountGitCommit, resetGitCommit, updateGitCommitCounts, handleGitOp,
  setLastCommitMessage, commitBoxHasFocus,
} from "./git-commit.js";

let panelEl = null, headEl = null, filesEl = null, diffEl = null;

let curCwd = "";
let curBranch = "";
let files = [];
let selected = null;
let softRefresh = false;
let pendingSelect = null;

function ensureDom() {
  if (panelEl) return;
  panelEl = document.createElement("div");
  panelEl.id = "git-panel";
  panelEl.innerHTML =
    '<div class="git-box">' +
    '<div class="git-head"><span class="git-title"></span>' +
    '<span class="git-actions"><button class="git-refresh">Refresh</button>' +
    '<button class="git-close">Close</button></span></div>' +
    '<div class="git-body"><div class="gd-files"></div>' +
    '<div class="gd-right"><div class="gd-diff"></div></div></div>' +
    "</div>";
  document.body.appendChild(panelEl);
  headEl = panelEl.querySelector(".git-title");
  filesEl = panelEl.querySelector(".gd-files");
  diffEl = panelEl.querySelector(".gd-diff");
  mountGitCommit(panelEl.querySelector(".gd-right"), { cwd: () => curCwd, refresh: () => request(true) });
  panelEl.addEventListener("mousedown", (e) => { if (e.target === panelEl) close(); });
  panelEl.querySelector(".git-close").onclick = () => close();
  panelEl.querySelector(".git-refresh").onclick = () => request();
  panelEl.addEventListener("keydown", onKey);
  panelEl.tabIndex = -1;
  initGitResize(panelEl);
}

function request(soft) {
  if (!curCwd) return;
  softRefresh = !!soft;
  if (!soft) {
    filesEl.innerHTML = '<div class="gd-empty">Loading…</div>';
    diffEl.innerHTML = "";
    selected = null;
  }
  wsSend({ type: "getGitStatus", cwd: curCwd });
}

export function setGitStatus(msg) {
  if (!panelEl || msg.cwd !== curCwd) return;
  const soft = softRefresh;
  softRefresh = false;
  const keep = soft ? selected : pendingSelect;
  pendingSelect = null;
  curBranch = msg.branch || "";
  files = msg.repo ? (msg.files || []) : null;
  updateGitCommitCounts(files);
  renderHead();
  renderFiles();

  if (!files || !files.length) { selected = null; diffEl.innerHTML = ""; return; }
  const stay = keep && files.some((f) => f.path === keep);
  selectFile(stay ? keep : files[0].path, soft);
}

export function setGitDiff(msg) {
  if (!panelEl || msg.cwd !== curCwd || msg.path !== selected) return;
  renderDiff(msg.patch || "");
}

export function setGitOp(msg) {
  if (!panelEl || msg.cwd !== curCwd) return;
  handleGitOp(msg);
}

export function setLastCommit(msg) {
  if (!panelEl) return;
  setLastCommitMessage(msg);
}

export function gitChanged(msg) {
  if (!isOpen() || msg.cwd !== curCwd) return;
  request(true);
}

function renderHead() {
  headEl.textContent = "Git";
  if (files === null) return;
  const b = curBranch ? " · " + curBranch : "";
  const n = files.length;
  headEl.textContent = "Git" + b + (n ? "  ·  " + n + (n === 1 ? " change" : " changes") : "");
}

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
  const scrollTop = filesEl.scrollTop;
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
    const staged = f.kind === "staged";
    row.innerHTML =
      '<span class="gd-dot" data-kind="' + kindLabel(f) + '"></span>' +
      '<span class="gd-path"><span class="gd-dir"></span><span class="gd-base"></span></span>' +
      '<span class="gd-count"></span>' +
      '<button class="gd-stage" title="' + (staged ? "Unstage" : "Stage") + '">' + (staged ? "−" : "+") + "</button>";
    row.querySelector(".gd-dir").textContent = dir;
    row.querySelector(".gd-base").textContent = base;
    const cnt = row.querySelector(".gd-count");
    cnt.textContent = countText(f);
    cnt.dataset.kind = kindLabel(f);
    row.querySelector(".gd-stage").onclick = (e) => {
      e.stopPropagation();
      wsSend({ type: staged ? "unstageFiles" : "stageFiles", cwd: curCwd, paths: [f.path] });
    };
    row.onclick = () => selectFile(f.path);
    filesEl.appendChild(row);
  }
  filesEl.scrollTop = scrollTop;
}

let pendingDiffScroll = 0;

function selectFile(path, keepScroll) {
  const f = files && files.find((x) => x.path === path);
  if (!f) return;
  selected = path;
  for (const row of filesEl.querySelectorAll(".gd-file")) {
    row.classList.toggle("sel", row.dataset.path === path);
  }
  const sel = filesEl.querySelector(".gd-file.sel");
  if (sel && !keepScroll) sel.scrollIntoView({ block: "nearest" });
  pendingDiffScroll = keepScroll ? diffEl.scrollTop : 0;
  if (!keepScroll) diffEl.innerHTML = '<div class="gd-empty">Loading diff…</div>';
  wsSend({ type: "getGitDiff", cwd: curCwd, path, mode: f.kind });
}

const MAX_DIFF_LINES = 2000;

function renderDiff(patch) {
  diffEl.innerHTML = "";

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
    pendingDiffScroll = 0;
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
  diffEl.scrollTop = Math.min(pendingDiffScroll, Math.max(0, diffEl.scrollHeight - diffEl.clientHeight));
  pendingDiffScroll = 0;
}

function onKey(e) {
  if (e.key === "Escape") { e.preventDefault(); close(); return; }
  if (commitBoxHasFocus()) return;
  if (!files || !files.length) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const idx = files.findIndex((f) => f.path === selected);
  const next = e.key === "ArrowDown"
    ? Math.min(files.length - 1, idx + 1)
    : Math.max(0, idx - 1);
  if (files[next]) selectFile(files[next].path);
}

export function isOpen() { return panelEl && panelEl.classList.contains("open"); }

export function openGit({ cwd, select } = {}) {
  ensureDom();
  applyGitPanelSize();
  curCwd = cwd || activeCwd();
  pendingSelect = select || null;
  curBranch = "";
  files = [];
  selected = null;
  resetGitCommit();
  panelEl.classList.add("open");
  panelEl.focus();
  if (!curCwd) {
    files = null;
    updateGitCommitCounts(files);
    renderHead();
    renderFiles();
    diffEl.innerHTML = "";
    return;
  }
  wsSend({ type: "watchGit", cwd: curCwd });
  request();
}

function close() {
  if (!panelEl || !panelEl.classList.contains("open")) return;
  panelEl.classList.remove("open");
  wsSend({ type: "unwatchGit" });
}
export function closeGit() { close(); }
export function toggleGit() { isOpen() ? close() : openGit(); }
