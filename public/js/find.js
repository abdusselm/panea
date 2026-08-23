// In-terminal find (⌘F): a small search box that floats over the focused pane
// and drives xterm's search addon — highlight all matches, jump next/previous,
// live match count. One reusable box, re-parented into whichever pane leaf is
// focused when opened, so it rides with that pane through splits. The addon
// itself lives on the pane (panes.js) and is disposed with the terminal; here
// we only own the box DOM and one results subscription, both torn down on close.

import { state, focusedPane } from "./state.js";

// Match highlight colors (proposed decorations API; allowProposedApi is on).
// Warm cmux-ish tints: dim yellow for all matches, brighter for the active one.
const DECOR = {
  matchBackground: "#5c531e",
  matchBorder: "#7a6d28",
  matchOverviewRuler: "#f0c674",
  activeMatchBackground: "#c0842e",
  activeMatchBorder: "#e0a44a",
  activeMatchColorOverviewRuler: "#ffab82",
};

let boxEl = null, inputEl = null, countEl = null;
let curPaneId = null;      // pane the box is currently attached to
let resultsSub = null;     // onDidChangeResults disposable for that pane

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
  // Keep clicks/keys inside the box from bubbling to the pane (which would
  // steal focus back to the terminal).
  boxEl.addEventListener("mousedown", (e) => e.stopPropagation());
  boxEl.querySelector(".find-prev").onclick = () => search("prev");
  boxEl.querySelector(".find-next").onclick = () => search("next");
  boxEl.querySelector(".find-close").onclick = () => close();
  inputEl.addEventListener("input", () => search("incremental"));
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); search(e.shiftKey ? "prev" : "next"); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    // ⌘F while the box is focused re-selects rather than reopening.
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

// ---- open / close ---------------------------------------------------------

export function openFind() {
  const p = focusedPane();
  if (!p || !p.search) return; // no pane, or addon unavailable
  ensureDom();
  // Re-parent the box into the focused pane if it moved.
  if (curPaneId !== p.id) {
    detachResults();
    p.el.appendChild(boxEl);
    curPaneId = p.id;
    resultsSub = p.search.onDidChangeResults((e) => updateCount(e));
  }
  boxEl.classList.add("open");
  inputEl.focus();
  inputEl.select();
  if (inputEl.value) search("next"); // re-run a carried-over query
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

// Called by destroyPane so a closing pane doesn't leave a dangling box or
// subscription. Skips refocusing the (dead) terminal.
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
