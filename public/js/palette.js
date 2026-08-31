

import { state, runtime, focusedPane } from "./state.js";
import { tablistEl } from "./dom.js";
import { enc, u8ToB64, eachLeaf } from "./util.js";
import { DEFAULT_FONT_SIZE } from "./theme.js";
import { wsSend } from "./ws.js";
import { newTab, activateTab, startRename } from "./tabs.js";
import { splitPane, closePane, restartPane, setFontSize, focusPane } from "./panes.js";
import { openNotifications } from "./notifications.js";
import { reopenClosedTab, hasClosedTabs, saveLayoutInteractive, openLayoutInteractive, deleteLayoutPick, layoutNames } from "./layouts.js";
import { openGit } from "./git.js";
import { openFind } from "./find.js";
import { openSettings } from "./settings.js";
import { chordFor, prettyChord } from "./shortcuts.js";
import { startPaneRename, openPaneMenuForPane } from "./pane-identity.js";
import { hidePane, revealAllPanes, countHiddenPanes } from "./pane-visibility.js";

const hk = (id) => prettyChord(chordFor(id));

let customCommands = [];
let paletteEl = null, paletteInput = null, paletteListEl = null;
let paletteCmds = [];
let paletteItems = [];
let itemRows = [];
let paletteIndex = 0;

export function setCustomCommands(list) {
  customCommands = Array.isArray(list) ? list : [];
  refreshOpenPalette();
}

export function refreshOpenPalette() {
  if (paletteIsOpen()) { paletteCmds = buildPaletteCommands(); renderPalette(); }
}

function runInPane(paneId, text) {
  wsSend({ type: "input", paneId, data: u8ToB64(enc.encode(text)) });
}

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

const GROUP_ORDER = ["Tabs", "Panes", "Layouts", "Git", "View", "Notifications", "Switch tab", "Custom"];

function buildPaletteCommands() {
  const cmds = [];
  const add = (group, title, hint, run) => cmds.push({ group, title, hint, run });

  add("Tabs", "New terminal", hk("new-tab"), () => newTab());
  add("Tabs", "Rename tab", "", renameActiveTab);
  if (hasClosedTabs()) add("Tabs", "Reopen closed tab", hk("reopen-tab"), () => reopenClosedTab());
  add("Tabs", "Next tab", "", () => cycleTab(1));
  add("Tabs", "Previous tab", "", () => cycleTab(-1));

  add("Panes", "Split right", hk("split-right"), () => { const p = focusedPane(); if (p) splitPane(p.id, "h"); });
  add("Panes", "Split down", hk("split-down"), () => { const p = focusedPane(); if (p) splitPane(p.id, "v"); });
  add("Panes", "Close pane", hk("close-pane"), () => { const p = focusedPane(); if (p) closePane(p.id); });
  add("Panes", "Hide pane", hk("hide-pane"), () => { const p = focusedPane(); if (p) hidePane(p.id); });
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
  if (activeTab && countHiddenPanes(activeTab)) {
    add("Panes", `Reveal hidden panes (${countHiddenPanes(activeTab)})`, "", () => revealAllPanes(activeTab));
  }
  add("Panes", "Restart pane", "", () => { const p = focusedPane(); if (p) restartPane(p.id); });
  add("Panes", "Rename pane", "", () => { const p = focusedPane(); if (p) startPaneRename(p); });
  add("Panes", "Pane color…", "", () => { const p = focusedPane(); if (p) openPaneMenuForPane(p); });
  add("Panes", "Find in terminal", hk("find"), () => openFind());
  add("Panes", "Clear terminal", "", clearFocusedTerminal);

  add("Layouts", "Save this tab as layout…", "", () => saveLayoutInteractive());
  if (layoutNames().length) {
    add("Layouts", "Open layout…", "", () => openLayoutInteractive());
    add("Layouts", "Delete layout…", "", () => deleteLayoutPick());
  }

  add("Git", "Git diff…", hk("git-diff"), () => openGit());

  add("View", "Keyboard shortcuts…", "", () => openSettings());
  add("View", "Increase font size", "⌘+", () => setFontSize(runtime.fontSize + 1));
  add("View", "Decrease font size", "⌘−", () => setFontSize(runtime.fontSize - 1));
  add("View", "Reset font size", "⌘0", () => setFontSize(DEFAULT_FONT_SIZE));

  add("Notifications", "Jump to next notification", "", nextAttentionPane);
  add("Notifications", "Show notifications", hk("notifications"), () => openNotifications());

  state.tabs.forEach((tab, i) => add("Switch tab", tab.name, i < 9 ? `⌘${i + 1}` : "", () => activateTab(tab.id)));

  for (const c of customCommands) {
    if (!c || !c.run) continue;
    const where = c.where || c.in || "focused";
    add("Custom", c.name || String(c.run), "run · " + where, () => runCommandLine(String(c.run), where));
  }
  return cmds;
}

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
  wsSend({ type: "getCommands" });
  wsSend({ type: "getLayouts" });
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
  const items = ranked.slice(0, 80).map((r) => r.cmd);

  const byGroup = new Map();
  for (const cmd of items) {
    if (!byGroup.has(cmd.group)) byGroup.set(cmd.group, []);
    byGroup.get(cmd.group).push(cmd);
  }
  const groups = [];
  for (const g of GROUP_ORDER) if (byGroup.has(g)) groups.push([g, byGroup.get(g)]);
  for (const [g, arr] of byGroup) if (!GROUP_ORDER.includes(g)) groups.push([g, arr]);

  paletteListEl.innerHTML = "";
  paletteItems = [];
  itemRows = [];
  for (const [g, arr] of groups) {
    const head = document.createElement("div");
    head.className = "palette-group";
    head.textContent = g;
    paletteListEl.appendChild(head);
    for (const cmd of arr) {
      const i = paletteItems.length;
      paletteItems.push(cmd);
      const row = document.createElement("div");
      row.className = "palette-item";
      row.innerHTML = '<span class="pi-title"></span><span class="pi-hint"></span>';
      row.querySelector(".pi-title").textContent = cmd.title;
      row.querySelector(".pi-hint").textContent = cmd.hint || "";
      row.onmousemove = () => setPaletteIndex(i);
      row.onclick = () => { setPaletteIndex(i); runPaletteSelection(); };
      paletteListEl.appendChild(row);
      itemRows.push(row);
    }
  }
  paletteIndex = 0;
  if (itemRows.length) itemRows[0].classList.add("sel");
  if (!paletteItems.length) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "No matching commands";
    paletteListEl.appendChild(empty);
  }
}

function setPaletteIndex(i) {
  paletteIndex = i;
  itemRows.forEach((el, j) => el.classList.toggle("sel", j === i));
}

function movePalette(delta) {
  if (!paletteItems.length) return;
  const n = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
  setPaletteIndex(n);
  const el = itemRows[n];
  if (el) el.scrollIntoView({ block: "nearest" });
}

function runPaletteSelection() {
  const cmd = paletteItems[paletteIndex];
  closePalette();
  if (cmd) setTimeout(() => cmd.run(), 0);
}
