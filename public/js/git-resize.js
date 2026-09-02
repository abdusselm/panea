

import { runtime } from "./state.js";
import { persist } from "./session.js";
import { clampGitBox, clampFilesWidth, defaultGitBox, defaultFilesWidth } from "./git-size.js";

let boxEl = null;

const GRIPS = [
  ["left", "ew-resize"],
  ["right", "ew-resize"],
  ["bottom", "ns-resize"],
  ["bottom-left", "nesw-resize"],
  ["bottom-right", "nwse-resize"],
];

function apply(box, filesWidth) {
  runtime.gitPanel = { w: box.w, h: box.h, filesW: clampFilesWidth(filesWidth, box.w) };
  if (!boxEl) return;
  boxEl.style.setProperty("--git-w", runtime.gitPanel.w + "px");
  boxEl.style.setProperty("--git-h", runtime.gitPanel.h + "px");
  boxEl.style.setProperty("--gd-files-w", runtime.gitPanel.filesW + "px");
}

export function applyGitPanelSize() {
  const saved = runtime.gitPanel;
  const box = saved ? clampGitBox(saved, window.innerWidth, window.innerHeight)
    : defaultGitBox(window.innerWidth, window.innerHeight);
  apply(box, saved && saved.filesW ? saved.filesW : defaultFilesWidth(box.w));
}

export function restoreGitPanel(saved) {
  if (!saved) return;
  const w = Number(saved.w), h = Number(saved.h), filesW = Number(saved.filesW);
  if (!(w > 0) || !(h > 0)) return;
  runtime.gitPanel = { w, h, filesW: filesW > 0 ? filesW : defaultFilesWidth(w) };
}

function startDrag(el, e, cursor, onMove) {
  if (e.button !== 0) return;
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  document.body.classList.add("git-resizing");
  document.body.style.cursor = cursor;
  const stop = () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", stop);
    el.removeEventListener("pointercancel", stop);
    document.body.classList.remove("git-resizing");
    document.body.style.cursor = "";
    persist();
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
}

function onGripDown(e) {
  const grip = e.currentTarget;
  const edge = grip.dataset.edge;
  const rect = boxEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const top = rect.top;
  const widthEdge = edge !== "bottom";
  const heightEdge = edge !== "left" && edge !== "right";
  startDrag(grip, e, grip.dataset.cursor, (ev) => {
    const cur = runtime.gitPanel;
    const w = widthEdge ? 2 * Math.abs(ev.clientX - centerX) : cur.w;
    const h = heightEdge ? ev.clientY - top : cur.h;
    apply(clampGitBox({ w, h }, window.innerWidth, window.innerHeight), cur.filesW);
  });
}

function onSplitDown(e) {
  const left = boxEl.querySelector(".gd-files").getBoundingClientRect().left;
  startDrag(e.currentTarget, e, "col-resize", (ev) => {
    const cur = runtime.gitPanel;
    apply({ w: cur.w, h: cur.h }, ev.clientX - left);
  });
}

function resetBox() {
  runtime.gitPanel = null;
  applyGitPanelSize();
  persist();
}

function resetFilesWidth() {
  const cur = runtime.gitPanel;
  apply({ w: cur.w, h: cur.h }, defaultFilesWidth(cur.w));
  persist();
}

function onWindowResize() {
  if (!runtime.gitPanel) return;
  apply(clampGitBox(runtime.gitPanel, window.innerWidth, window.innerHeight), runtime.gitPanel.filesW);
}

export function initGitResize(panelEl) {
  boxEl = panelEl.querySelector(".git-box");
  const split = document.createElement("div");
  split.className = "gd-split";
  split.title = "Drag to resize the file list — double-click to reset";
  split.addEventListener("pointerdown", onSplitDown);
  split.addEventListener("dblclick", resetFilesWidth);
  panelEl.querySelector(".git-body").insertBefore(split, panelEl.querySelector(".gd-diff"));

  for (const [edge, cursor] of GRIPS) {
    const grip = document.createElement("div");
    grip.className = "git-grip git-grip-" + edge;
    grip.dataset.edge = edge;
    grip.dataset.cursor = cursor;
    grip.title = "Drag to resize — double-click to reset";
    grip.addEventListener("pointerdown", onGripDown);
    grip.addEventListener("dblclick", resetBox);
    boxEl.appendChild(grip);
  }

  window.addEventListener("resize", onWindowResize);
  applyGitPanelSize();
}
