

import { state, focusedPane } from "./state.js";

const DECOR = {
  matchBackground: "#5c531e",
  matchBorder: "#7a6d28",
  matchOverviewRuler: "#f0c674",
  activeMatchBackground: "#c0842e",
  activeMatchBorder: "#e0a44a",
  activeMatchColorOverviewRuler: "#ffab82",
};

let boxEl = null, inputEl = null, countEl = null;
let curPaneId = null;
let resultsSub = null;

function ensureDom() {
  if (boxEl) return;
  boxEl = document.createElement("div");
  boxEl.className = "find-box";
  boxEl.innerHTML =
    '<input class="find-input" type="text" placeholder="Find" spellcheck="false" autocomplete="off" />' +
    '<span class="find-count"></span>' +
    '<button class="find-prev" title="Previous (⇧⏎)">↑</button>' +
    '<button class="find-next" title="Next (⏎)">↓</button>' +
    '<button class="find-close" title="Close (Esc)">✕</button>';
  inputEl = boxEl.querySelector(".find-input");
  countEl = boxEl.querySelector(".find-count");

  boxEl.addEventListener("mousedown", (e) => e.stopPropagation());
  boxEl.querySelector(".find-prev").onclick = () => search("prev");
  boxEl.querySelector(".find-next").onclick = () => search("next");
  boxEl.querySelector(".find-close").onclick = () => close();
  inputEl.addEventListener("input", () => search("incremental"));
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); search(e.shiftKey ? "prev" : "next"); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }

    else if (e.metaKey && e.key.toLowerCase() === "f") { e.preventDefault(); inputEl.select(); }
  });
}

function paneAddon(id) {
  const p = id && state.panes.get(id);
  return p && p.search ? p.search : null;
}

function updateCount(e) {
  if (!countEl) return;
  if (!e || e.resultCount === 0) { countEl.textContent = inputEl.value ? "No results" : ""; return; }
  const idx = e.resultIndex >= 0 ? e.resultIndex + 1 : 0;
  countEl.textContent = idx + "/" + e.resultCount;
}

function search(mode) {
  const addon = paneAddon(curPaneId);
  if (!addon) return;
  const q = inputEl.value;
  if (!q) { try { addon.clearDecorations(); } catch (_) {} updateCount(null); return; }
  const opts = { decorations: DECOR, regex: false, caseSensitive: false, wholeWord: false };
  if (mode === "prev") addon.findPrevious(q, opts);
  else addon.findNext(q, mode === "incremental" ? { ...opts, incremental: true } : opts);
}

export function openFind() {
  const p = focusedPane();
  if (!p || !p.search) return;
  ensureDom();

  if (curPaneId !== p.id) {
    detachResults();
    p.el.appendChild(boxEl);
    curPaneId = p.id;
    resultsSub = p.search.onDidChangeResults((e) => updateCount(e));
  }
  boxEl.classList.add("open");
  inputEl.focus();
  inputEl.select();
  if (inputEl.value) search("next");
}

function detachResults() {
  if (resultsSub) { try { resultsSub.dispose(); } catch (_) {} resultsSub = null; }
}

export function closeFind() { close(); }

function close() {
  const addon = paneAddon(curPaneId);
  if (addon) { try { addon.clearDecorations(); } catch (_) {} }
  detachResults();
  if (boxEl) { boxEl.classList.remove("open"); if (boxEl.parentNode) boxEl.parentNode.removeChild(boxEl); }
  const p = focusedPane();
  if (p && p.id === curPaneId && !p.exited) p.term.focus();
  curPaneId = null;
}

export function closeFindFor(paneId) {
  if (curPaneId !== paneId) return;
  detachResults();
  if (boxEl) { boxEl.classList.remove("open"); if (boxEl.parentNode) boxEl.parentNode.removeChild(boxEl); }
  curPaneId = null;
}

export function isFindOpen() { return boxEl && boxEl.classList.contains("open"); }

export function toggleFind() {
  const p = focusedPane();
  if (isFindOpen() && p && p.id === curPaneId) close();
  else openFind();
}
