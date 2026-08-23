

import { state, runtime } from "./state.js";
import { eachLeaf } from "./util.js";
import { refreshTabClasses, activateTab } from "./tabs.js";
import { focusPane } from "./panes.js";
import { updateNotifyIndicator } from "./notifications.js";
import { IDLE_MS, classifyIdle, REASON_LABEL } from "./attention-signals.js";

export function paneIsForeground(p) {
  return p.tabId === state.activeTabId && p.id === state.focusedPaneId && runtime.windowFocused;
}

export function handleActivity(paneId, bytes) {
  const p = state.panes.get(paneId);
  if (!p) return;
  if (paneIsForeground(p)) { clearPaneAttention(p); return; }

  const now = Date.now();
  if (!p.burstStart) p.burstStart = now;
  p.burstBytes = (p.burstBytes || 0) + bytes.length;

  if (bytes.includes(7)) { ringAttention(p, "alert"); return; }

  clearTimeout(p.idleTimer);
  p.idleTimer = setTimeout(() => {
    if (paneIsForeground(p)) { resetBurst(p); return; }
    const busyMs = p.burstStart ? Date.now() - p.burstStart : 0;
    const reason = classifyIdle(p.term, busyMs);
    resetBurst(p);
    if (reason) ringAttention(p, reason);
  }, IDLE_MS);
}

function resetBurst(p) { p.burstStart = 0; p.burstBytes = 0; }

export function signalExplicit(paneId, message) {
  const p = state.panes.get(paneId);
  if (!p || paneIsForeground(p)) return;
  ringAttention(p, "notify", message);
}

function anyPaneAttention(tab) {
  let any = false;
  eachLeaf(tab.tree, (l) => { const q = state.panes.get(l.id); if (q && q.attention) any = true; });
  return any;
}

export function ringAttention(p, reason, message = "") {
  const escalated = p.attention && reason !== p.attnReason && reason === "permission";
  const firstTime = !p.attention;
  p.attention = true;
  p.attnReason = reason;
  p.attnMessage = message;
  p.el.classList.add("attn");
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { tab.attention = true; refreshTabClasses(); }
  updateNotifyIndicator();
  if (firstTime || escalated) notifyAttention(p, tab);
}

export function clearPaneAttention(p) {
  clearTimeout(p.idleTimer);
  resetBurst(p);
  if (p.attention) { p.attention = false; p.attnReason = ""; p.attnMessage = ""; p.el.classList.remove("attn"); }
  const tab = state.tabs.find((t) => t.id === p.tabId);
  if (tab) { tab.attention = anyPaneAttention(tab); refreshTabClasses(); }
  updateNotifyIndicator();
}

export function attentionLabel(p) {
  if (p.attnReason === "notify" && p.attnMessage) return p.attnMessage;
  return REASON_LABEL[p.attnReason] || "wants attention";
}

function notifyAttention(p, tab) {
  if (paneIsForeground(p)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const name = (tab && tab.name) || "terminal";
  const title = (p.title || "terminal") + " · " + name;
  const n = new Notification("panea — " + title, { body: attentionLabel(p) });
  n.onclick = () => { window.focus(); if (tab) activateTab(tab.id); focusPane(p.id); n.close(); };
}
