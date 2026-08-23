// Global keyboard shortcuts (⌘-based). Returns false to swallow the key so it
// never reaches the terminal; true to let it through. ⌘K (palette) is handled
// separately in palette.js so it works even when no pane is focused.

import { state, runtime } from "./state.js";
import { DEFAULT_FONT_SIZE } from "./theme.js";
import { activateTab } from "./tabs.js";
import { setFontSize } from "./panes.js";
import { runShortcut } from "./shortcuts.js";

export function handleGlobalKey(e, paneId) {
  if (e.type !== "keydown") return true;
  if (!e.metaKey) return true;
  // Rebindable ⌘+letter actions run through the shortcut registry (user
  // overrides + defaults). command-palette is capture-only; see main.js.
  if (runShortcut(e, paneId)) return false;
  // Fixed, non-rebindable: font size (⌘±0) and tab-switch (⌘1–9). These are
  // positional/standard, so they stay hard-wired and out of the Settings UI.
  const k = e.key.toLowerCase();
  if (k === "=" || k === "+") { e.preventDefault(); setFontSize(runtime.fontSize + 1); return false; }
  if (k === "-" || k === "_") { e.preventDefault(); setFontSize(runtime.fontSize - 1); return false; }
  if (k === "0") { e.preventDefault(); setFontSize(DEFAULT_FONT_SIZE); return false; }
  if (k >= "1" && k <= "9") {
    const idx = Number(k) - 1;
    if (state.tabs[idx]) { e.preventDefault(); activateTab(state.tabs[idx].id); return false; }
  }
  return true;
}
