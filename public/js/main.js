// Entry point: wire up top-level DOM controls and global listeners, then open
// the WebSocket. Every feature lives in its own module; this file only connects
// them to the shell chrome and the document.

import { state, runtime } from "./state.js";
import { connect } from "./ws.js";
import { newTab } from "./tabs.js";
import { refitTab } from "./panes.js";
import { clearPaneAttention, handleActivity } from "./attention.js";
import { handleGlobalKey } from "./keyboard.js";
import { openPalette, togglePalette } from "./palette.js";
import { openNotifications, toggleNotifications } from "./notifications.js";
import { reopenClosedTab, saveCurrentLayout, openLayout, saveLayoutInteractive, openLayoutInteractive, deleteLayoutPick } from "./layouts.js";
import { splitPane, closePane } from "./panes.js";
import { openGit, toggleGit } from "./git.js";
import { openFind, toggleFind } from "./find.js";
import { openSettings } from "./settings.js";
import { chordFromEvent, chordFor } from "./shortcuts.js";

// Debug/automation surface. ES modules don't leak their bindings to the global
// scope (good), so expose a small curated namespace for the screenshot harness,
// a future CLI, and console poking. Not a stable public API.
window.panea = { state, runtime, newTab, openPalette, togglePalette, openNotifications, toggleNotifications, reopenClosedTab, saveCurrentLayout, openLayout, saveLayoutInteractive, openLayoutInteractive, deleteLayoutPick, openGit, toggleGit, openFind, toggleFind, openSettings, splitPane, closePane, handleActivity };

// Sidebar chrome buttons.
document.getElementById("new-tab").onclick = () => newTab();
document.getElementById("empty-new").onclick = () => newTab();
document.getElementById("cmdk").onclick = () => openPalette();
document.getElementById("bell").onclick = () => toggleNotifications();
document.getElementById("settings-btn").onclick = () => openSettings();

// The command-palette chord toggles the palette from anywhere, in the capture
// phase so the terminal textarea never sees it. It's the one shortcut handled
// here rather than in keyboard.js (which is why it's marked capture in the
// registry); rebinding it in Settings changes what this matches.
document.addEventListener("keydown", (e) => {
  const chord = chordFromEvent(e);
  if (chord && chord === chordFor("command-palette")) {
    e.preventDefault(); e.stopPropagation(); togglePalette();
  }
}, true);

// ⌘ shortcuts also work when focus isn't inside a terminal (sidebar, overlays).
// Inside a terminal, xterm's own key handler already routes them, so skip to
// avoid double-firing. The capture listener above already consumed the palette
// chord, so it never reaches here.
document.addEventListener("keydown", (e) => {
  if (!e.metaKey) return;
  if (e.target.closest && e.target.closest(".leaf-term")) return;
  handleGlobalKey(e, state.focusedPaneId);
});

window.addEventListener("resize", () => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (tab) refitTab(tab);
});

// Track window focus so we only ring / notify when the user isn't already here.
window.addEventListener("focus", () => {
  runtime.windowFocused = true;
  const p = state.focusedPaneId && state.panes.get(state.focusedPaneId);
  if (p) clearPaneAttention(p);
});
window.addEventListener("blur", () => { runtime.windowFocused = false; });

// Ask once for permission to post native desktop notifications.
if (typeof Notification !== "undefined" && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

connect();
