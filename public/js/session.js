

import { state, runtime } from "./state.js";
import { MIN_FONT_SIZE, MAX_FONT_SIZE } from "./theme.js";
import { uid } from "./util.js";
import { wsSend } from "./ws.js";
import { newTab, createTabPaneEl, activateTab, renderTabList, instantiateTree } from "./tabs.js";
import { renderTab } from "./panes.js";
import { applySidebarWidth } from "./sidebar.js";

const SCROLL_LINES = 800;
const SCROLL_MAX_CHARS = 200000;

function captureScroll(p) {
  if (!p || !p.serialize) return "";
  let out = "";
  try {

    out = p.serialize.serialize({ scrollback: SCROLL_LINES, excludeModes: true, excludeAltBuffer: true }) || "";
  } catch { out = ""; }
  if (out.length > SCROLL_MAX_CHARS) out = out.slice(-SCROLL_MAX_CHARS);
  return out;
}

function serializeTree(node) {
  if (!node) return node;
  if (node.kind !== "leaf") {
    return { kind: "split", dir: node.dir, ratio: node.ratio, children: [serializeTree(node.children[0]), serializeTree(node.children[1])] };
  }
  const leaf = { kind: "leaf", id: node.id };
  const p = state.panes.get(node.id);
  if (p) {
    const cwd = (p.meta && p.meta.cwd) || p.cwd || "";
    if (cwd) leaf.cwd = cwd;

    const agent = (p.meta && p.meta.agent) || p.restoreAgent || "";
    if (agent) leaf.agent = agent;
    if (p.customTitle) leaf.name = p.customTitle;
    if (p.color) leaf.color = p.color;
    const scroll = captureScroll(p);
    if (scroll) leaf.scroll = scroll;
  }
  return leaf;
}

export function serialize() {
  return {
    activeTabId: state.activeTabId,
    settings: { fontSize: runtime.fontSize, sidebarWidth: runtime.sidebarWidth },
    tabs: state.tabs.map((t) => ({ id: t.id, name: t.name, cwd: t.cwd, tree: serializeTree(t.tree), customName: !!t.customName })),
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
  if (layout && layout.settings && layout.settings.sidebarWidth) {
    applySidebarWidth(layout.settings.sidebarWidth);
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
