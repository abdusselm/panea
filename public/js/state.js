

import { DEFAULT_FONT_SIZE } from "./theme.js";
import { firstLeaf } from "./util.js";

export const state = {
  tabs: [],
  activeTabId: null,
  panes: new Map(),
  focusedPaneId: null,
};

export const runtime = {
  fontSize: DEFAULT_FONT_SIZE,
  sidebarWidth: 280,
  gitPanel: null,
  filesPanel: { open: false, w: 260 },
  renaming: false,
  windowFocused: typeof document !== "undefined" ? document.hasFocus() : true,
};

export function focusedPane() {
  return state.focusedPaneId ? state.panes.get(state.focusedPaneId) : undefined;
}

export function activeCwd() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return "";
  const fp = focusedPane();
  if (fp && fp.tabId === tab.id && fp.meta && fp.meta.cwd) return fp.meta.cwd;
  const leaf = firstLeaf(tab.tree);
  const p = leaf && state.panes.get(leaf.id);
  return (p && p.meta && p.meta.cwd) || "";
}
