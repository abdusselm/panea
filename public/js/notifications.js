// Notification panel: one place listing every pane currently asking for
// attention (an AI agent that finished its turn or is waiting on you). Click a
// row to jump straight to that pane; clear them all at once. Reads the same
// per-pane attention flag the sidebar badges use.

import { state } from "./state.js";
import { eachLeaf } from "./util.js";
import { activateTab } from "./tabs.js";
import { focusPane } from "./panes.js";
import { clearPaneAttention, attentionLabel } from "./attention.js";

let panelEl = null, listEl = null;
const bellEl = document.getElementById("bell");
const bellCountEl = bellEl ? bellEl.querySelector(".bell-count") : null;

// Every pane in attention, paired with its tab, in sidebar order.
function collect() {
  const items = [];
  for (const tab of state.tabs) {
    eachLeaf(tab.tree, (l) => {
      const p = state.panes.get(l.id);
      if (p && p.attention) items.push({ tab, pane: p });
    });
  }
  return items;
}

// Sidebar bell: show a count badge whenever anything needs attention.
export function updateNotifyIndicator() {
  if (!bellEl) return;
  const n = collect().length;
  bellEl.classList.toggle("has", n > 0);
  if (bellCountEl) bellCountEl.textContent = n > 0 ? String(n) : "";
  if (isOpen()) render();
}

function ensureDom() {
  if (panelEl) return;
  panelEl = document.createElement("div");
  panelEl.id = "notif-panel";
  panelEl.innerHTML =
    '<div class="notif-box">' +
    '<div class="notif-head"><span class="notif-title">Notifications</span>' +
    '<button class="notif-clear">Clear all</button></div>' +
    '<div class="notif-list"></div></div>';
  document.body.appendChild(panelEl);
  listEl = panelEl.querySelector(".notif-list");
  panelEl.addEventListener("mousedown", (e) => { if (e.target === panelEl) close(); });
  panelEl.querySelector(".notif-clear").onclick = () => { clearAll(); };
}

function render() {
  const items = collect();
  listEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "notif-empty";
    empty.textContent = "No notifications";
    listEl.appendChild(empty);
    return;
  }
  for (const { tab, pane } of items) {
    const row = document.createElement("div");
    row.className = "notif-item";
    row.innerHTML = '<span class="ni-dot" data-reason="' + (pane.attnReason || "alert") + '"></span>' +
      '<div class="ni-text"><div class="ni-name"></div><div class="ni-sub"></div></div>';
    row.querySelector(".ni-name").textContent = pane.title || tab.name || "terminal";
    row.querySelector(".ni-sub").textContent = attentionLabel(pane) + " · in " + (tab.name || "shell");
    row.onclick = () => { jumpTo(tab, pane); };
    listEl.appendChild(row);
  }
}

function jumpTo(tab, pane) {
  activateTab(tab.id);
  focusPane(pane.id); // clears this pane's attention
  updateNotifyIndicator();
  if (!collect().length) close();
}

function clearAll() {
  for (const { pane } of collect()) clearPaneAttention(pane);
  updateNotifyIndicator();
  render();
}

export function isOpen() { return panelEl && panelEl.classList.contains("open"); }

export function openNotifications() {
  ensureDom();
  panelEl.classList.add("open");
  render();
}

export function closeNotifications() { close(); }
function close() { if (panelEl) panelEl.classList.remove("open"); }

export function toggleNotifications() { isOpen() ? close() : openNotifications(); }
