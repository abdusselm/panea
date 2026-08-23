// Session persistence: serialize the tab/pane layout and (debounced) push it to
// the server, and rebuild it on reconnect.

import { state, runtime } from "./state.js";
import { MIN_FONT_SIZE, MAX_FONT_SIZE } from "./theme.js";
import { uid } from "./util.js";
import { wsSend } from "./ws.js";
import { newTab, createTabPaneEl, activateTab, renderTabList, instantiateTree } from "./tabs.js";
import { renderTab } from "./panes.js";

export function serialize() {
  return {
    activeTabId: state.activeTabId,
    settings: { fontSize: runtime.fontSize },
    tabs: state.tabs.map((t) => ({ id: t.id, name: t.name, cwd: t.cwd, tree: t.tree, customName: !!t.customName })),
  };
}

let saveT = null;
export function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => wsSend({ type: "session", layout: serialize() }), 200);
}

export function restoreSession(layout) {
  if (state.tabs.length) return;
  if (layout && layout.settings && layout.settings.fontSize) {
    runtime.fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, layout.settings.fontSize));
  }
  if (!layout || !layout.tabs || !layout.tabs.length) { newTab(); return; }
  for (const t of layout.tabs) {
    const tab = { id: t.id || uid(), name: t.name || "shell", cwd: t.cwd, tree: t.tree, customName: !!t.customName };
    state.tabs.push(tab);
    createTabPaneEl(tab);
    instantiateTree(tab, tab.tree);
    renderTab(tab);
  }
  const wanted = layout.activeTabId && state.tabs.find((x) => x.id === layout.activeTabId);
  activateTab(wanted ? layout.activeTabId : state.tabs[0].id);
  renderTabList();
}
