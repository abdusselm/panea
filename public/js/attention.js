// Attention: a background pane earns a notification when it rings the bell
// (BEL) or, more usefully for AI agents, when it produces output and then goes
// quiet — i.e. it finished its turn or is waiting for the user's answer.

import { state, runtime } from "./state.js";
import { eachLeaf } from "./util.js";
import { refreshTabClasses, activateTab } from "./tabs.js";
import { focusPane } from "./panes.js";
import { updateNotifyIndicator } from "./notifications.js";

const ATTN_IDLE_MS = 700;

export function paneIsForeground(p) {
  return p.tabId === state.activeTabId && p.id === state.focusedPaneId && runtime.windowFocused;
}

export function handleActivity(paneId, bytes) {
  const p = state.panes.get(paneId);
  if (!p) return;
  if (paneIsForeground(p)) { clearPaneAttention(p); return; } // user is watching
  if (bytes.includes(7)) { setPaneAttention(p); return; }     // bell: immediate
  // Otherwise wait for the burst of output to settle, then ring.
  clearTimeout(p.idleTimer);
  p.idleTimer = setTimeout(() => { if (!paneIsForeground(p)) setPaneAttention(p); }, ATTN_IDLE_MS);
}

function anyPaneAttention(tab) {
  let any = false;
  eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (q && q.attention) any = true; });
  return any;
}

export function setPaneAttention(p) {
  const firstTime = !p.attention;
  p.attention = true;
  p.el.classList.add("attn");
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { tab.attention = true; refreshTabClasses(); }
  updateNotifyIndicator();
  if (firstTime) notifyAttention(p, tab);
}

export function clearPaneAttention(p) {
  clearTimeout(p.idleTimer);
  if (p.attention) { p.attention = false; p.el.classList.remove("attn"); }
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { tab.attention = anyPaneAttention(tab); refreshTabClasses(); }
  updateNotifyIndicator();
}

// Native desktop notification when panea isn't the pane the user is looking at.
function notifyAttention(p, tab) {
  if (paneIsForeground(p)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const name = (tab && tab.name) || "terminal";
  const n = new Notification("panea — " + name, { body: (p.title || "terminal") + " needs your attention" });
  n.onclick = () => { window.focus(); if (tab) activateTab(tab.id); focusPane(p.id); n.close(); };
}
