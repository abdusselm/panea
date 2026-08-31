

import { state } from "./state.js";
import { newTab } from "./tabs.js";
import { closePane, splitPane } from "./panes.js";
import { reopenClosedTab } from "./layouts.js";
import { toggleNotifications } from "./notifications.js";
import { toggleFind } from "./find.js";
import { toggleScrollAnchor } from "./scroll-anchor.js";
import { toggleTranscript } from "./transcript.js";
import { toggleGit } from "./git.js";
import { togglePalette } from "./palette.js";
import { wsSend } from "./ws.js";

export const SHORTCUTS = [
  { id: "command-palette", label: "Command palette", category: "General", def: "Cmd-K", capture: true, run: () => togglePalette() },
  { id: "new-tab", label: "New terminal", category: "Tabs", def: "Cmd-T", run: () => newTab() },
  { id: "reopen-tab", label: "Reopen closed tab", category: "Tabs", def: "Cmd-Shift-T", run: () => reopenClosedTab() },
  { id: "split-right", label: "Split right", category: "Panes", def: "Cmd-D", run: (pid) => splitPane(state.focusedPaneId || pid, "h") },
  { id: "split-down", label: "Split down", category: "Panes", def: "Cmd-Shift-D", run: (pid) => splitPane(state.focusedPaneId || pid, "v") },
  { id: "close-pane", label: "Close pane", category: "Panes", def: "Cmd-W", run: (pid) => closePane(state.focusedPaneId || pid) },
  { id: "find", label: "Find in terminal", category: "Panes", def: "Cmd-F", run: () => toggleFind() },
  { id: "jump-latest", label: "Jump to latest / back", category: "Panes", def: "Cmd-J", run: (pid) => toggleScrollAnchor(state.focusedPaneId || pid) },
  { id: "transcript", label: "Transcript (fold exchanges)", category: "Panes", def: "Cmd-E", run: () => toggleTranscript() },
  { id: "git-diff", label: "Git diff", category: "View", def: "Cmd-G", run: () => toggleGit() },
  { id: "notifications", label: "Notifications", category: "View", def: "Cmd-Shift-N", run: () => toggleNotifications() },
];

const byId = new Map(SHORTCUTS.map((s) => [s.id, s]));
let overrides = {};

export function chordFromEvent(e) {
  if (!e.metaKey) return "";
  const m = e.code && e.code.match(/^Key([A-Z])$/);
  if (!m) return "";
  let c = "Cmd";
  if (e.shiftKey) c += "-Shift";
  if (e.altKey) c += "-Alt";
  if (e.ctrlKey) c += "-Ctrl";
  return c + "-" + m[1];
}

export function chordFor(id) {
  const s = byId.get(id);
  return overrides[id] || (s && s.def) || "";
}

const SYM = { Cmd: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃" };
export function prettyChord(chord) {
  if (!chord) return "";
  return chord.split("-").map((p) => SYM[p] || p).join("");
}

export function runShortcut(e, paneId) {
  const chord = chordFromEvent(e);
  if (!chord) return false;
  const hit = SHORTCUTS.find((s) => !s.capture && chordFor(s.id) === chord);
  if (!hit) return false;
  e.preventDefault();
  hit.run(paneId);
  return true;
}

export function setShortcutOverrides(map) {
  overrides = {};
  if (map && typeof map === "object") {
    for (const s of SHORTCUTS) if (typeof map[s.id] === "string") overrides[s.id] = map[s.id];
  }
}

function persist() {
  wsSend({ type: "saveSettings", settings: { shortcuts: overrides } });
}

export function shortcutList() {
  return SHORTCUTS.map((s) => ({
    id: s.id, label: s.label, category: s.category,
    chord: chordFor(s.id), def: s.def, custom: !!overrides[s.id],
  }));
}

export function rebindShortcut(id, chord) {
  if (!byId.has(id) || !/^Cmd(-Shift)?(-Alt)?(-Ctrl)?-[A-Z]$/.test(chord)) {
    return { ok: false, reason: "invalid" };
  }
  const clash = SHORTCUTS.find((s) => s.id !== id && chordFor(s.id) === chord);
  if (clash) return { ok: false, reason: "conflict", conflict: clash.label };
  if (chord === byId.get(id).def) delete overrides[id];
  else overrides[id] = chord;
  persist();
  return { ok: true };
}

export function resetShortcut(id) {
  if (overrides[id]) { delete overrides[id]; persist(); }
}

export function resetAllShortcuts() {
  if (Object.keys(overrides).length) { overrides = {}; persist(); }
}
