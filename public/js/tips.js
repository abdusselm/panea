import { state } from "./state.js";
import { eachLeaf } from "./util.js";
import { ICON } from "./theme.js";
import { wsSend } from "./ws.js";
import { SHORTCUTS, chordFor, prettyChord } from "./shortcuts.js";
import { hasClosedTabs } from "./layouts.js";
import { isPaneBooting } from "./pane-boot.js";
import { isTerminalPane } from "./pane-kind.js";
import { TIP_GAP_MS, pickTip, tipContext, tipIdsForFeature, mergeTipMemory, tipMemorySnapshot } from "./tips-model.js";

const LINGER_MS = 9000;
const HOVER_LINGER_MS = 2500;
const BOOT_RECHECK_MS = 1500;
const READ_MS = 1500;
const FADE_MS = 180;
const SAVE_DEBOUNCE_MS = 300;
const MIN_PANE_WIDTH = 360;

const memory = { retired: new Set(), shown: new Map() };
let enabled = true;
let enabledDirty = false;
let loaded = false;
let dirty = false;
let saveTimer = 0;
let pendingPaneId = "";
let lastShownAt = 0;
let active = null;

function persistTips() {
  dirty = true;
  if (!loaded || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    dirty = false;
    enabledDirty = false;
    wsSend({ type: "saveSettings", settings: { tips: { enabled, ...tipMemorySnapshot(memory) } } });
  }, SAVE_DEBOUNCE_MS);
}

export function setTipsSettings(tips) {
  const src = tips && typeof tips === "object" ? tips : {};
  mergeTipMemory(memory, src);
  if (!enabledDirty) enabled = src.enabled !== false;
  loaded = true;
  if (dirty) persistTips();
  if (!enabled) hide(false);
  if (pendingPaneId) {
    const paneId = pendingPaneId;
    pendingPaneId = "";
    offerTip(paneId);
  }
}

function contextFor(pane) {
  const tab = state.tabs.find((t) => t.id === pane.tabId);
  const metas = [];
  let paneCount = 0;
  if (tab) eachLeaf(tab.tree, (leaf) => {
    paneCount++;
    const p = state.panes.get(leaf.id);
    if (p && p.meta) metas.push(p.meta);
  });
  return tipContext({ metas, paneCount, tabCount: state.tabs.length, hasClosedTabs: hasClosedTabs() });
}

export function offerTip(paneId) {
  if (!loaded) { pendingPaneId = paneId; return; }
  if (!enabled || active) return;
  if (lastShownAt && Date.now() - lastShownAt < TIP_GAP_MS) return;
  const pane = state.panes.get(paneId);
  if (!isTerminalPane(pane) || pane.hidden || pane.exited) return;
  if (pane.el.clientWidth < MIN_PANE_WIDTH) return;
  const tip = pickTip(contextFor(pane), memory);
  if (tip) show(pane, tip);
}

function renderPart(part, paneId) {
  if (typeof part === "string") return document.createTextNode(part);
  const shortcut = part.key && SHORTCUTS.find((s) => s.id === part.key);
  if (!shortcut) {
    const chip = document.createElement("kbd");
    chip.className = "pane-tip-key";
    chip.textContent = part.chord || "";
    return chip;
  }
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "pane-tip-key runnable";
  chip.title = "Try it";
  chip.textContent = prettyChord(chordFor(shortcut.id));
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    hide(false);
    shortcut.run(paneId);
  });
  return chip;
}

function show(pane, tip) {
  const el = document.createElement("div");
  el.className = "pane-tip";
  el.dataset.tip = tip.id;
  const badge = document.createElement("span");
  badge.className = "pane-tip-badge";
  badge.textContent = "Tip";
  const text = document.createElement("span");
  text.className = "pane-tip-text";
  for (const part of tip.parts) text.append(renderPart(part, pane.id));
  const close = document.createElement("button");
  close.type = "button";
  close.className = "pane-tip-close";
  close.title = "Don't show this tip again";
  close.innerHTML = ICON.close;
  close.addEventListener("click", (e) => { e.stopPropagation(); retireTip(tip.id); });
  el.append(badge, text, close);
  el.addEventListener("mouseenter", () => { if (active && active.el === el) clearTimeout(active.timer); });
  el.addEventListener("mouseleave", () => { if (active && active.el === el) arm(HOVER_LINGER_MS); });
  pane.el.appendChild(el);
  active = { paneId: pane.id, tipId: tip.id, el, keys: pane.term.onKey(() => hide(false)), timer: 0, shownAt: Date.now() };
  lastShownAt = active.shownAt;
  arm(LINGER_MS);
}

function arm(ms) {
  if (!active) return;
  clearTimeout(active.timer);
  active.timer = setTimeout(expire, ms);
}

function expire() {
  if (!active) return;
  if (isPaneBooting(active.paneId)) { arm(BOOT_RECHECK_MS); return; }
  hide(true);
}

function hide(fade) {
  if (!active) return;
  const { el, keys, timer, shownAt, tipId } = active;
  active = null;
  clearTimeout(timer);
  try { keys.dispose(); } catch (_) {}
  if (!memory.retired.has(tipId) && Date.now() - shownAt >= READ_MS) {
    memory.shown.set(tipId, (memory.shown.get(tipId) || 0) + 1);
    persistTips();
  }
  if (!fade) { el.remove(); return; }
  el.classList.add("leaving");
  setTimeout(() => el.remove(), FADE_MS);
}

function retireTip(tipId) {
  if (!memory.retired.has(tipId)) {
    memory.retired.add(tipId);
    persistTips();
  }
  if (active && active.tipId === tipId) hide(true);
}

export function retireTipsForFeature(featureId) {
  for (const tipId of tipIdsForFeature(featureId)) retireTip(tipId);
}

export function closeTipFor(paneId) {
  if (active && active.paneId === paneId) hide(false);
}

export function tipsEnabled() { return enabled; }

export function setTipsEnabled(on) {
  enabled = !!on;
  enabledDirty = true;
  if (!enabled) hide(false);
  persistTips();
}

export function hasTipHistory() {
  return memory.retired.size > 0 || memory.shown.size > 0;
}

export function resetTips() {
  hide(false);
  memory.retired.clear();
  memory.shown.clear();
  lastShownAt = 0;
  persistTips();
}
