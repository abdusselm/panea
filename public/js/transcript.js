

import { state, focusedPane } from "./state.js";
import { TERM_THEME } from "./theme.js";
import { splitSections } from "./transcript-model.js";
import { linesToHtml } from "./buffer-html.js";

const ANSI = [
  TERM_THEME.black, TERM_THEME.red, TERM_THEME.green, TERM_THEME.yellow,
  TERM_THEME.blue, TERM_THEME.magenta, TERM_THEME.cyan, TERM_THEME.white,
  TERM_THEME.brightBlack, TERM_THEME.brightRed, TERM_THEME.brightGreen, TERM_THEME.brightYellow,
  TERM_THEME.brightBlue, TERM_THEME.brightMagenta, TERM_THEME.brightCyan, TERM_THEME.brightWhite,
];
ANSI.background = TERM_THEME.background;
ANSI.foreground = TERM_THEME.foreground;

let boxEl = null, listEl = null, countEl = null;
let curPaneId = null;

function bufferOf(paneId) {
  const p = state.panes.get(paneId);
  return p ? p.term.buffer.active : null;
}

function lineTextOf(paneId) {
  const buf = bufferOf(paneId);
  return (i) => {
    const line = buf && buf.getLine(i);
    return line ? line.translateToString(true) : "";
  };
}

function marksOf(pane) {
  return pane.exchanges
    .filter((x) => x.marker && x.marker.line >= 0)
    .map((x) => ({ line: x.marker.line, text: x.text }));
}

function ensureDom() {
  if (boxEl) return;
  boxEl = document.createElement("div");
  boxEl.className = "transcript";
  boxEl.innerHTML =
    '<div class="transcript-bar">' +
    '<span class="transcript-title">Transcript</span>' +
    '<span class="transcript-count"></span>' +
    '<button class="transcript-expand" title="Expand all">Expand all</button>' +
    '<button class="transcript-collapse" title="Collapse all">Collapse all</button>' +
    '<button class="transcript-close" title="Close (Esc)">✕</button>' +
    "</div>" +
    '<div class="transcript-list"></div>';
  listEl = boxEl.querySelector(".transcript-list");
  countEl = boxEl.querySelector(".transcript-count");
  boxEl.addEventListener("mousedown", (e) => e.stopPropagation());
  boxEl.querySelector(".transcript-close").onclick = () => close();
  boxEl.querySelector(".transcript-expand").onclick = () => setAll(true);
  boxEl.querySelector(".transcript-collapse").onclick = () => setAll(false);
  boxEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  });
}

function setAll(open) {
  for (const item of listEl.querySelectorAll(".transcript-item")) {
    if (open === item.classList.contains("open")) continue;
    toggleItem(item, open);
  }
}

function bodyHtml(paneId, section) {
  const buf = bufferOf(paneId);
  if (!buf) return "";
  return linesToHtml((i) => buf.getLine(i), section.start, section.end, ANSI);
}

function toggleItem(item, open) {
  const body = item.querySelector(".transcript-body");
  if (open) {
    if (!body.dataset.filled) {
      const section = JSON.parse(item.dataset.section);
      body.innerHTML = bodyHtml(curPaneId, section);
      body.dataset.filled = "1";
    }
    item.classList.add("open");
  } else {
    item.classList.remove("open");
  }
}

function render(pane) {
  const sections = splitSections({
    lineCount: pane.term.buffer.active.length,
    marks: marksOf(pane),
    lineText: lineTextOf(pane.id),
  });
  listEl.innerHTML = "";
  countEl.textContent = sections.length ? sections.length + " sections" : "";
  if (!sections.length) {
    listEl.innerHTML = '<div class="transcript-empty">Nothing in this pane yet.</div>';
    return;
  }
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const item = document.createElement("div");
    item.className = "transcript-item";
    item.dataset.section = JSON.stringify(section);
    item.innerHTML =
      '<button class="transcript-head" type="button">' +
      '<span class="transcript-caret"></span>' +
      '<span class="transcript-label"></span>' +
      '<span class="transcript-lines"></span>' +
      "</button>" +
      '<button class="transcript-goto" type="button" title="Scroll the pane here">↧</button>' +
      '<pre class="transcript-body"></pre>';
    item.querySelector(".transcript-label").textContent = section.title;
    item.querySelector(".transcript-lines").textContent = section.lines + " lines";
    item.querySelector(".transcript-head").onclick = () =>
      toggleItem(item, !item.classList.contains("open"));
    item.querySelector(".transcript-goto").onclick = (e) => {
      e.stopPropagation();
      gotoSection(section);
    };
    listEl.appendChild(item);
    if (i === sections.length - 1) toggleItem(item, true);
  }
}

function gotoSection(section) {
  const p = state.panes.get(curPaneId);
  if (!p) return;
  close();
  p.term.scrollToLine(section.start);
}

export function openTranscript() {
  const p = focusedPane();
  if (!p) return;
  ensureDom();
  if (boxEl.parentNode !== p.el) {
    if (boxEl.parentNode) boxEl.parentNode.removeChild(boxEl);
    p.el.appendChild(boxEl);
  }
  curPaneId = p.id;
  render(p);
  boxEl.classList.add("open");
  boxEl.tabIndex = -1;
  boxEl.focus();
}

function close() {
  if (boxEl) {
    boxEl.classList.remove("open");
    if (boxEl.parentNode) boxEl.parentNode.removeChild(boxEl);
    listEl.innerHTML = "";
  }
  const p = state.panes.get(curPaneId);
  curPaneId = null;
  if (p && !p.exited) p.term.focus();
}

export function closeTranscript() { close(); }

export function closeTranscriptFor(paneId) {
  if (curPaneId === paneId) close();
}

export function isTranscriptOpen() {
  return !!(boxEl && boxEl.classList.contains("open"));
}

export function toggleTranscript() {
  const p = focusedPane();
  if (isTranscriptOpen() && p && p.id === curPaneId) close();
  else openTranscript();
}
