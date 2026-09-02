

import { DEFAULT_FONT_SIZE } from "./theme.js";

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
  renaming: false,
  windowFocused: typeof document !== "undefined" ? document.hasFocus() : true,
};

export function focusedPane() {
  return state.focusedPaneId ? state.panes.get(state.focusedPaneId) : undefined;
}
