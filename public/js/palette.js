// Command palette (⌘K): built-in actions, per-tab switches, and user-defined
// custom commands from ~/.panea/commands.json. Fuzzy filter, arrow/enter nav.

import { state, runtime, focusedPane } from "./state.js";
import { tablistEl } from "./dom.js";
import { enc, u8ToB64, eachLeaf } from "./util.js";
import { DEFAULT_FONT_SIZE } from "./theme.js";
import { wsSend } from "./ws.js";
import { newTab, activateTab, startRename } from "./tabs.js";
import { splitPane, closePane, restartPane, setFontSize, focusPane } from "./panes.js";
import { openNotifications } from "./notifications.js";
import { reopenClosedTab, hasClosedTabs, saveLayoutInteractive, openLayout, deleteLayoutInteractive, layoutNames } from "./layouts.js";

let customCommands = [];
let paletteEl = null, paletteInput = null, paletteListEl = null;
let paletteCmds = [];   // full command set built when the palette opens
let paletteItems = [];  // current filtered view
let paletteIndex = 0;

// Called by the ws layer when the server delivers the command list.
export function setCustomCommands(list) {
  customCommands = Array.isArray(list) ? list : [];
  refreshOpenPalette();
}

// Rebuild the command set if the palette is already open. Server data (custom
// commands, saved layouts) arrives async over the socket, after the palette
// may have been built; without this the new entries wouldn't show until the
// next open.
export function refreshOpenPalette() {
  if (paletteIsOpen()) { paletteCmds = buildPaletteCommands(); renderPalette(); }
}

function runInPane(paneId, text) {
  wsSend({ type: "input", paneId, data: u8ToB64(enc.encode(text)) });
}

// Send a shell command line to a target pane, honoring the entry's "where":
// the focused pane (default), a fresh tab, or a split of the focused pane.
function runCommandLine(run, where) {
  const line = /[\r\n]$/.test(run) ? run : run + "\r";
  if (where === "new-tab" || where === "tab") {
    newTab();
    const p = focusedPane();
    if (p) setTimeout(() => runInPane(p.id, line), 450);
    return;
  }
  if (where === "split" || where === "split-right" || where === "split-down") {
    const src = focusedPane();
    if (src) splitPane(src.id, where === "split-down" ? "v" : "h");
    else newTab();
    const np = focusedPane();
    if (np) setTimeout(() => runInPane(np.id, line), 450);
    return;
  }
  const p = focusedPane();
  if (p) runInPane(p.id, line);
}

function cycleTab(delta) {
  if (!state.tabs.length) return;
  const i = state.tabs.findIndex((t) => t.id === state.activeTabId);
  const n = ((i < 0 ? 0 : i) + delta + state.tabs.length) % state.tabs.length;
  activateTab(state.tabs[n].id);
}

function nextAttentionPane() {
  for (const tab of state.tabs) {
    let target = null;
    eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (!target && q && q.attention) target = q; });
    if (target) { activateTab(tab.id); focusPane(target.id); return; }
  }
}

function renameActiveTab() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;
  const row = [...tablistEl.children].find((r) => r.dataset.tabId === tab.id);
  if (row) startRename(tab, row.querySelector(".name"));
}

function clearFocusedTerminal() {
  const p = focusedPane();
  if (p) p.term.clear();
}

// Assemble the palette: built-in actions + a switch entry per tab + customs.
function buildPaletteCommands() {
  const cmds = [];
  const add = (title, hint, run) => cmds.push({ title, hint, run });
  add("New terminal", "⌘T", () => newTab());
  add("Split right", "⌘D", () => { const p = focusedPane(); if (p) splitPane(p.id, "h"); });
  add("Split down", "⇧⌘D", () => { const p = focusedPane(); if (p) splitPane(p.id, "v"); });
  add("Close pane", "⌘W", () => { const p = focusedPane(); if (p) closePane(p.id); });
  add("Rename tab", "", renameActiveTab);
  if (hasClosedTabs()) add("Reopen closed tab", "⇧⌘T", () => reopenClosedTab());
  add("Save current layout…", "", () => saveLayoutInteractive());
  for (const name of layoutNames()) add("Open layout: " + name, "", () => openLayout(name));
  for (const name of layoutNames()) add("Delete layout: " + name, "", () => deleteLayoutInteractive(name));
  add("Next tab", "", () => cycleTab(1));
  add("Previous tab", "", () => cycleTab(-1));
  add("Jump to next notification", "", nextAttentionPane);
  add("Show notifications", "⇧⌘N", () => openNotifications());
  add("Clear terminal", "", clearFocusedTerminal);
  add("Restart pane", "", () => { const p = focusedPane(); if (p) restartPane(p.id); });
  add("Increase font size", "⌘+", () => setFontSize(runtime.fontSize + 1));
  add("Decrease font size", "⌘−", () => setFontSize(runtime.fontSize - 1));
  add("Reset font size", "⌘0", () => setFontSize(DEFAULT_FONT_SIZE));
  state.tabs.forEach((tab, i) => add(`Switch to: ${tab.name}`, i < 9 ? `⌘${i + 1}` : "", () => activateTab(tab.id)));
  for (const c of customCommands) {
    if (!c || !c.run) continue;
    const where = c.where || c.in || "focused";
    add(c.name || String(c.run), "run · " + where, () => runCommandLine(String(c.run), where));
  }
  return cmds;
}

// Subsequence fuzzy score; contiguous runs score higher. 0 = no match.
function fuzzyScore(hay, needle) {
  hay = hay.toLowerCase(); needle = needle.toLowerCase();
  if (!needle) return 1;
  let hi = 0, score = 0, run = 0;
  for (let ni = 0; ni < needle.length; ni++) {
    let found = -1;
    for (let j = hi; j < hay.length; j++) { if (hay[j] === needle[ni]) { found = j; break; } }
    if (found < 0) return 0;
    run = found === hi ? run + 1 : 0;
    score += 1 + run;
    hi = found + 1;
  }
  return score;
}

function ensurePaletteDom() {
  if (paletteEl) return;
  paletteEl = document.createElement("div");
  paletteEl.id = "palette";
  paletteEl.innerHTML =
    '<div class="palette-box">' +
    '<input class="palette-input" type="text" placeholder="Type a command…" spellcheck="false" autocomplete="off" />' +
    '<div class="palette-list"></div></div>';
  document.body.appendChild(paletteEl);
  paletteInput = paletteEl.querySelector(".palette-input");
  paletteListEl = paletteEl.querySelector(".palette-list");
  paletteEl.addEventListener("mousedown", (e) => { if (e.target === paletteEl) closePalette(); });
  paletteInput.addEventListener("input", () => renderPalette());
  paletteInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); movePalette(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); movePalette(-1); }
    else if (e.key === "Enter") { e.preventDefault(); runPaletteSelection(); }
    else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
  });
}

export function paletteIsOpen() { return paletteEl && paletteEl.classList.contains("open"); }

export function openPalette() {
  ensurePaletteDom();
  wsSend({ type: "getCommands" }); // refresh customs from disk
  wsSend({ type: "getLayouts" });  // refresh saved layouts
  paletteCmds = buildPaletteCommands();
  paletteEl.classList.add("open");
  paletteInput.value = "";
  renderPalette();
  paletteInput.focus();
}

export function closePalette() {
  if (!paletteEl) return;
  paletteEl.classList.remove("open");
  const p = focusedPane();
  if (p) p.term.focus();
}

export function togglePalette() { paletteIsOpen() ? closePalette() : openPalette(); }

function renderPalette() {
  const q = paletteInput.value.trim();
  let ranked = paletteCmds.map((cmd) => ({ cmd, s: fuzzyScore(cmd.title + " " + (cmd.hint || ""), q) }));
  if (q) ranked = ranked.filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
  paletteItems = ranked.slice(0, 60).map((r) => r.cmd);
  paletteIndex = 0;
  paletteListEl.innerHTML = "";
  paletteItems.forEach((cmd, i) => {
    const row = document.createElement("div");
    row.className = "palette-item" + (i === 0 ? " sel" : "");
    row.innerHTML = '<span class="pi-title"></span><span class="pi-hint"></span>';
    row.querySelector(".pi-title").textContent = cmd.title;
    row.querySelector(".pi-hint").textContent = cmd.hint || "";
    row.onmousemove = () => setPaletteIndex(i);
    row.onclick = () => { setPaletteIndex(i); runPaletteSelection(); };
    paletteListEl.appendChild(row);
  });
  if (!paletteItems.length) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "No matching commands";
    paletteListEl.appendChild(empty);
  }
}

function setPaletteIndex(i) {
  paletteIndex = i;
  [...paletteListEl.children].forEach((el, j) => el.classList.toggle("sel", j === i));
}

function movePalette(delta) {
  if (!paletteItems.length) return;
  const n = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
  setPaletteIndex(n);
  const el = paletteListEl.children[n];
  if (el) el.scrollIntoView({ block: "nearest" });
}

function runPaletteSelection() {
  const cmd = paletteItems[paletteIndex];
  closePalette();
  if (cmd) setTimeout(() => cmd.run(), 0);
}
