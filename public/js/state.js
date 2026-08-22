// Shared application state. Two objects so every module mutates the same
// reference: `state` holds the tab/pane model, `runtime` holds mutable scalar
// flags (kept in an object because ES module bindings can't be reassigned from
// an importing module).

import { DEFAULT_FONT_SIZE } from "./theme.js";

export const state = {
  tabs: [],           // { id, name, cwd, tree, el, attention, customName }
  activeTabId: null,
  panes: new Map(),   // paneId -> { id, term, fit, tabId, cwd, exited, el, termEl, ro, titleEl, title, attention, idleTimer, meta }
  focusedPaneId: null,
};

export const runtime = {
  fontSize: DEFAULT_FONT_SIZE,
  renaming: false,                 // a tab-rename input is open; suppress list rebuilds
  windowFocused: typeof document !== "undefined" ? document.hasFocus() : true,
};

// The currently focused pane, or undefined.
export function focusedPane() {
  return state.focusedPaneId ? state.panes.get(state.focusedPaneId) : undefined;
}
