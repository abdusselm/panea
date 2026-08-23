

import { state, runtime } from "./state.js";
import { DEFAULT_FONT_SIZE } from "./theme.js";
import { activateTab } from "./tabs.js";
import { setFontSize } from "./panes.js";
import { runShortcut } from "./shortcuts.js";

export function handleGlobalKey(e, paneId) {
  if (e.type !== "keydown") return true;
  if (!e.metaKey) return true;

  if (runShortcut(e, paneId)) return false;

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
