// Global keyboard shortcuts (⌘-based). Returns false to swallow the key so it
// never reaches the terminal; true to let it through. ⌘K (palette) is handled
// separately in palette.js so it works even when no pane is focused.

import { state, runtime } from "./state.js";
import { DEFAULT_FONT_SIZE } from "./theme.js";
import { newTab, activateTab } from "./tabs.js";
import { closePane, splitPane, setFontSize } from "./panes.js";
import { toggleNotifications } from "./notifications.js";
import { reopenClosedTab } from "./layouts.js";

export function handleGlobalKey(e, paneId) {
  if (e.type !== "keydown") return true;
  if (!e.metaKey) return true;
  const k = e.key.toLowerCase();
  if (k === "n" && e.shiftKey) { e.preventDefault(); toggleNotifications(); return false; }
  if (k === "t" && e.shiftKey) { e.preventDefault(); reopenClosedTab(); return false; }
  if (k === "t") { e.preventDefault(); newTab(); return false; }
  if (k === "w") { e.preventDefault(); closePane(state.focusedPaneId || paneId); return false; }
  if (k === "d") { e.preventDefault(); splitPane(state.focusedPaneId || paneId, e.shiftKey ? "v" : "h"); return false; }
  if (k === "=" || k === "+") { e.preventDefault(); setFontSize(runtime.fontSize + 1); return false; }
  if (k === "-" || k === "_") { e.preventDefault(); setFontSize(runtime.fontSize - 1); return false; }
  if (k === "0") { e.preventDefault(); setFontSize(DEFAULT_FONT_SIZE); return false; }
  if (k >= "1" && k <= "9") {
    const idx = Number(k) - 1;
    if (state.tabs[idx]) { e.preventDefault(); activateTab(state.tabs[idx].id); return false; }
  }
  return true;
}
