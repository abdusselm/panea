

import { wsSend } from "./ws.js";

let boxEl = null, msgEl = null, amendEl = null, commitBtn = null, stageAllBtn = null, statusEl = null, countEl = null;
let ctx = null;
let stagedCount = 0;
let changeCount = 0;
let busy = false;

function stageAllNeeded() {
  return !stagedCount && changeCount > 0 && !amendEl.checked;
}

function syncButtons() {
  const hasMessage = !!msgEl.value.trim();
  const canCommit = hasMessage && !busy && (amendEl.checked || stagedCount > 0 || changeCount > 0);
  commitBtn.disabled = !canCommit;
  commitBtn.textContent = busy ? "Committing…" : stageAllNeeded() ? "Stage all & commit" : "Commit";
  stageAllBtn.disabled = busy || !changeCount || (stagedCount > 0 && stagedCount === changeCount);
  const parts = [];
  if (stagedCount) parts.push(stagedCount + " staged");
  if (changeCount - stagedCount > 0) parts.push(changeCount - stagedCount + " unstaged");
  countEl.textContent = parts.join(" · ");
}

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.dataset.kind = kind || "";
}

function commit() {
  const message = msgEl.value.trim();
  if (!message || busy) return;
  busy = true;
  setStatus("", "");
  syncButtons();
  wsSend({
    type: "gitCommit",
    cwd: ctx.cwd(),
    message,
    amend: amendEl.checked,
    stageAll: stageAllNeeded(),
  });
}

export function mountGitCommit(parent, context) {
  ctx = context;
  boxEl = document.createElement("div");
  boxEl.className = "git-commit";
  boxEl.innerHTML =
    '<div class="gc-head"><span class="gc-count"></span>' +
    '<label class="gc-amend"><input type="checkbox" /> Amend last commit</label>' +
    '<button class="gc-stage-all">Stage all</button></div>' +
    '<textarea class="gc-msg" rows="3" spellcheck="false" placeholder="Commit message — ⌘⏎ to commit"></textarea>' +
    '<div class="gc-foot"><span class="gc-status"></span><button class="gc-commit">Commit</button></div>';
  parent.appendChild(boxEl);

  msgEl = boxEl.querySelector(".gc-msg");
  amendEl = boxEl.querySelector(".gc-amend input");
  commitBtn = boxEl.querySelector(".gc-commit");
  stageAllBtn = boxEl.querySelector(".gc-stage-all");
  statusEl = boxEl.querySelector(".gc-status");
  countEl = boxEl.querySelector(".gc-count");

  msgEl.oninput = () => syncButtons();
  msgEl.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
    if (e.key === "Escape") msgEl.blur();
  };
  amendEl.onchange = () => {
    if (amendEl.checked && !msgEl.value.trim()) wsSend({ type: "getLastCommitMessage", cwd: ctx.cwd() });
    syncButtons();
  };
  commitBtn.onclick = () => commit();
  stageAllBtn.onclick = () => wsSend({ type: "stageAll", cwd: ctx.cwd() });

  syncButtons();
  return boxEl;
}

export function resetGitCommit() {
  if (!boxEl) return;
  msgEl.value = "";
  amendEl.checked = false;
  busy = false;
  stagedCount = 0;
  changeCount = 0;
  setStatus("", "");
  syncButtons();
}

export function updateGitCommitCounts(files) {
  if (!boxEl) return;
  const list = files || [];
  changeCount = list.length;
  stagedCount = list.filter((f) => f.kind === "staged").length;
  boxEl.classList.toggle("disabled", files === null);
  syncButtons();
}

export function setLastCommitMessage(msg) {
  if (!boxEl || !ctx || msg.cwd !== ctx.cwd()) return;
  if (amendEl.checked && !msgEl.value.trim() && msg.message) {
    msgEl.value = msg.message;
    syncButtons();
  }
}

export function handleGitOp(msg) {
  if (!boxEl || !ctx || msg.cwd !== ctx.cwd()) return;
  if (msg.action === "commit") {
    busy = false;
    if (msg.ok) {
      msgEl.value = "";
      amendEl.checked = false;
      setStatus("Committed " + (msg.head || ""), "ok");
    } else {
      setStatus(msg.error || "commit failed", "error");
    }
  } else if (!msg.ok) {
    setStatus(msg.error || "git command failed", "error");
  }
  syncButtons();
  ctx.refresh();
}

export function focusCommitMessage() {
  if (msgEl) msgEl.focus();
}

export function commitBoxHasFocus() {
  return !!boxEl && boxEl.contains(document.activeElement);
}
