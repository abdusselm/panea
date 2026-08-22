// Entry point: wire up top-level DOM controls and global listeners, then open
// the WebSocket. Every feature lives in its own module; this file only connects
// them to the shell chrome and the document.

import { state, runtime } from "./state.js";
import { connect } from "./ws.js";
import { newTab } from "./tabs.js";
import { refitTab } from "./panes.js";
import { clearPaneAttention } from "./attention.js";
import { handleGlobalKey } from "./keyboard.js";
import { openPalette, togglePalette } from "./palette.js";
import { splitPane, closePane } from "./panes.js";

// Debug/automation surface. ES modules don't leak their bindings to the global
// scope (good), so expose a small curated namespace for the screenshot harness,
// a future CLI, and console poking. Not a stable public API.
window.panea = { state, runtime, newTab, openPalette, togglePalette, splitPane, closePane };

// Sidebar chrome buttons.
document.getElementById("new-tab").onclick = () => newTab();
document.getElementById("empty-new").onclick = () => newTab();
document.getElementById("cmdk").onclick = () => openPalette();

// ⌘K toggles the palette from anywhere (capture phase so the terminal textarea
// never sees the keystroke).
document.addEventListener("keydown", (e) => {
  if (e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "k") {
    e.preventDefault(); e.stopPropagation(); togglePalette();
  }
}, true);

// ⌘T / ⌘W / ⌘D also work when focus isn't inside a terminal (e.g. on the
// sidebar). Inside a terminal, xterm's key handler already routes these.
document.addEventListener("keydown", (e) => {
  if (e.metaKey && ["t", "w", "d"].includes(e.key.toLowerCase())) {
    if (!e.target.closest || !e.target.closest(".leaf-term")) handleGlobalKey(e, state.focusedPaneId);
  }
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
