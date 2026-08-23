// Central keyboard-shortcut registry: the single source of truth for every
// rebindable ⌘ action — its id, label, default chord, and the function it runs.
// keyboard.js and the ⌘K capture handler in main.js dispatch through here, and
// the Settings UI (settings.js) reads/edits the bindings. User overrides arrive
// from the server (settings.json) and are saved back the same way, so a binding
// is defined in exactly one place.
//
// Chord format is canonical: "Cmd[-Shift][-Alt][-Ctrl]-<LETTER>". Only ⌘+letter
// chords are representable, which keeps a binding from ever shadowing plain
// typing. Font-size (⌘±0) and tab-switch (⌘1–9) stay fixed in keyboard.js —
// they're positional/standard and intentionally not rebindable.

import { state } from "./state.js";
import { newTab } from "./tabs.js";
import { closePane, splitPane } from "./panes.js";
import { reopenClosedTab } from "./layouts.js";
import { toggleNotifications } from "./notifications.js";
import { toggleFind } from "./find.js";
import { toggleGit } from "./git.js";
import { togglePalette } from "./palette.js";
import { wsSend } from "./ws.js";

// `capture:true` marks an action handled by the capture-phase listener in
// main.js (it must be swallowed before the terminal sees it), not by the normal
// keyboard.js path — so runShortcut skips it to avoid double-firing.
export const SHORTCUTS = [
  { id: "command-palette", label: "Command palette", category: "General", def: "Cmd-K", capture: true, run: () => togglePalette() },
  { id: "new-tab", label: "New terminal", category: "Tabs", def: "Cmd-T", run: () => newTab() },
  { id: "reopen-tab", label: "Reopen closed tab", category: "Tabs", def: "Cmd-Shift-T", run: () => reopenClosedTab() },
  { id: "split-right", label: "Split right", category: "Panes", def: "Cmd-D", run: (pid) => splitPane(state.focusedPaneId || pid, "h") },
  { id: "split-down", label: "Split down", category: "Panes", def: "Cmd-Shift-D", run: (pid) => splitPane(state.focusedPaneId || pid, "v") },
  { id: "close-pane", label: "Close pane", category: "Panes", def: "Cmd-W", run: (pid) => closePane(state.focusedPaneId || pid) },
  { id: "find", label: "Find in terminal", category: "Panes", def: "Cmd-F", run: () => toggleFind() },
  { id: "git-diff", label: "Git diff", category: "View", def: "Cmd-G", run: () => toggleGit() },
  { id: "notifications", label: "Notifications", category: "View", def: "Cmd-Shift-N", run: () => toggleNotifications() },
];

const byId = new Map(SHORTCUTS.map((s) => [s.id, s]));
let overrides = {}; // id -> chord (only actions the user changed)

// ---- chord helpers --------------------------------------------------------

// Build the canonical chord for a keydown, or "" if it isn't a ⌘+letter combo.
// e.code (KeyT) is used for the letter so it's independent of Shift casing.
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

// The active chord for an action: the user override if set, else the default.
export function chordFor(id) {
  const s = byId.get(id);
  return overrides[id] || (s && s.def) || "";
}

// Pretty symbol form for display: "Cmd-Shift-T" -> "⌘⇧T".
const SYM = { Cmd: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃" };
export function prettyChord(chord) {
  if (!chord) return "";
  return chord.split("-").map((p) => SYM[p] || p).join("");
}

// ---- dispatch -------------------------------------------------------------

// Run the action bound to this event, if any (excluding capture-phase actions).
// Returns true if it handled the event (caller should swallow it).
export function runShortcut(e, paneId) {
  const chord = chordFromEvent(e);
  if (!chord) return false;
  const hit = SHORTCUTS.find((s) => !s.capture && chordFor(s.id) === chord);
  if (!hit) return false;
  e.preventDefault();
  hit.run(paneId);
  return true;
}

// ---- overrides + persistence ---------------------------------------------

// Applied when the server delivers settings (connect / save echo).
export function setShortcutOverrides(map) {
  overrides = {};
  if (map && typeof map === "object") {
    for (const s of SHORTCUTS) if (typeof map[s.id] === "string") overrides[s.id] = map[s.id];
  }
}

function persist() {
  wsSend({ type: "saveSettings", settings: { shortcuts: overrides } });
}

// Snapshot for the Settings UI: each action with its current + default chord.
export function shortcutList() {
  return SHORTCUTS.map((s) => ({
    id: s.id, label: s.label, category: s.category,
    chord: chordFor(s.id), def: s.def, custom: !!overrides[s.id],
  }));
}

// Try to bind `id` to `chord`. Rejects a chord already used by another action.
// Binding to the default clears the override instead of storing a redundant one.
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
