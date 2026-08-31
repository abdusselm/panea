

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
import { setAgents, mountResumeBar } from "./agents.js";
import { persist } from "./session.js";
import { initSidebarResize, applySidebarWidth } from "./sidebar.js";
import { startPaneRename, setPaneColor, openPaneMenuForPane } from "./pane-identity.js";
import { hidePane, showPane, togglePaneHidden, revealAllPanes } from "./pane-visibility.js";

window.panea = { hidePane, showPane, togglePaneHidden, revealAllPanes, state, runtime, newTab, openPalette, togglePalette, openNotifications, toggleNotifications, reopenClosedTab, saveCurrentLayout, openLayout, saveLayoutInteractive, openLayoutInteractive, deleteLayoutPick, openGit, toggleGit, openFind, toggleFind, openSettings, splitPane, closePane, handleActivity, setAgents, mountResumeBar, persist, applySidebarWidth, startPaneRename, setPaneColor, openPaneMenuForPane };

document.getElementById("new-tab").onclick = () => newTab();
document.getElementById("empty-new").onclick = () => newTab();
document.getElementById("cmdk").onclick = () => openPalette();
document.getElementById("bell").onclick = () => toggleNotifications();
document.getElementById("settings-btn").onclick = () => openSettings();

initSidebarResize();

document.addEventListener("keydown", (e) => {
  const chord = chordFromEvent(e);
  if (chord && chord === chordFor("command-palette")) {
    e.preventDefault(); e.stopPropagation(); togglePalette();
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (!e.metaKey) return;
  if (e.target.closest && e.target.closest(".leaf-term")) return;
  handleGlobalKey(e, state.focusedPaneId);
});

window.addEventListener("resize", () => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (tab) refitTab(tab);
});

window.addEventListener("focus", () => {
  runtime.windowFocused = true;
  const p = state.focusedPaneId && state.panes.get(state.focusedPaneId);
  if (p) clearPaneAttention(p);
});
window.addEventListener("blur", () => { runtime.windowFocused = false; });

if (typeof Notification !== "undefined" && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

connect();
