

import { state } from "./state.js";

const BOTTOM_EPSILON = 2;
const MARK_TIMEOUT = 12000;

const anchors = new Map();

function fmtLines(n) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + "k";
}

function schedule(a) {
  if (!a || a.raf) return;
  a.raf = requestAnimationFrame(() => { a.raf = 0; render(a); });
}

function linesBehind(pane) {
  const buf = pane.term.buffer.active;
  return Math.max(0, buf.baseY - buf.viewportY);
}

function render(a) {
  const pane = state.panes.get(a.paneId);
  if (!pane) return;
  const behind = linesBehind(pane);
  if (behind >= BOTTOM_EPSILON) {
    a.mode = "bottom";
    a.el.classList.remove("back");
    a.el.classList.add("open");
    a.labelEl.textContent = fmtLines(behind) + " below";
    a.btn.title = "Jump to latest output";
    return;
  }
  if (a.mark !== null) {
    a.mode = "back";
    a.el.classList.add("open", "back");
    a.labelEl.textContent = "Back";
    a.btn.title = "Back to where you were reading";
    return;
  }
  a.mode = "";
  a.el.classList.remove("open", "back");
}

function armMark(a, line) {
  a.mark = line;
  clearTimeout(a.markTimer);
  a.markTimer = setTimeout(() => { a.mark = null; a.markTimer = null; schedule(a); }, MARK_TIMEOUT);
}

function clearMark(a) {
  a.mark = null;
  clearTimeout(a.markTimer);
  a.markTimer = null;
}

function refocus(pane) {
  if (!pane.exited) pane.term.focus();
}

export function jumpToBottom(paneId) {
  const pane = state.panes.get(paneId);
  if (!pane) return;
  const a = anchors.get(paneId);
  const from = pane.term.buffer.active.viewportY;
  const behind = linesBehind(pane);
  pane.term.scrollToBottom();
  if (a) {
    if (behind >= BOTTOM_EPSILON) armMark(a, from);
    schedule(a);
  }
  refocus(pane);
}

export function jumpToMark(paneId) {
  const pane = state.panes.get(paneId);
  const a = anchors.get(paneId);
  if (!pane || !a || a.mark === null) return;
  const line = a.mark;
  clearMark(a);
  pane.term.scrollToLine(line);
  schedule(a);
  refocus(pane);
}

export function toggleScrollAnchor(paneId) {
  const a = anchors.get(paneId);
  if (a && a.mode === "back") jumpToMark(paneId);
  else jumpToBottom(paneId);
}

export function wireScrollAnchor(pane) {
  const el = document.createElement("div");
  el.className = "scroll-anchor";
  const btn = document.createElement("button");
  btn.className = "scroll-anchor-btn";
  btn.type = "button";
  const arrowEl = document.createElement("span");
  arrowEl.className = "scroll-anchor-arrow";
  const labelEl = document.createElement("span");
  labelEl.className = "scroll-anchor-label";
  btn.append(arrowEl, labelEl);
  el.append(btn);
  const a = {
    paneId: pane.id,
    el,
    btn,
    labelEl,
    subs: [],
    raf: 0,
    mark: null,
    markTimer: null,
    mode: "",
  };
  el.addEventListener("mousedown", (e) => e.stopPropagation());
  a.btn.onclick = (e) => { e.stopPropagation(); toggleScrollAnchor(pane.id); };
  pane.el.appendChild(el);
  a.subs.push(pane.term.onScroll(() => schedule(a)));
  a.subs.push(pane.term.onRender(() => schedule(a)));
  anchors.set(pane.id, a);
}

export function closeScrollAnchorFor(paneId) {
  const a = anchors.get(paneId);
  if (!a) return;
  for (const s of a.subs) { try { s.dispose(); } catch (_) {} }
  if (a.raf) cancelAnimationFrame(a.raf);
  clearTimeout(a.markTimer);
  if (a.el.parentNode) a.el.parentNode.removeChild(a.el);
  anchors.delete(paneId);
}
