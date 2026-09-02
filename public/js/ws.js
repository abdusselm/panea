

import { state } from "./state.js";
import { b64ToU8 } from "./util.js";
import { handleActivity } from "./attention.js";
import { restoreSession } from "./session.js";
import { refreshTabMeta } from "./tabs.js";
import { setCustomCommands, refreshOpenPalette } from "./palette.js";
import { setLayouts } from "./layouts.js";
import { setGitStatus, setGitDiff } from "./git.js";
import { setShortcutOverrides } from "./shortcuts.js";
import { refreshOpenSettings } from "./settings.js";
import { setAgents } from "./agents.js";
import { reattachPanes } from "./panes.js";
import { setConnectionState } from "./connection-status.js";
import { applyUpdateStatus } from "./update-status.js";
import { deliverPaneCwd } from "./pane-cwd.js";
import { markPaneReady } from "./pane-boot.js";

const RECONNECT_MS = 1000;
const PROBE_TIMEOUT_MS = 3000;

let ws = null;
let wsReady = false;
let everOpened = false;
let reconnectTimer = null;
let probeTimer = null;
const pendingOpens = [];

export function wsSend(obj) {
  const data = JSON.stringify(obj);
  if (wsReady && ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  else if (obj.type === "open") pendingOpens.push(data);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, RECONNECT_MS);
}

function dropSocket() {
  clearTimeout(probeTimer);
  probeTimer = null;
  wsReady = false;
  if (!ws) return;
  ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
  try { ws.close(); } catch (_) {}
  ws = null;
}

function probeConnection() {
  if (!ws || ws.readyState !== WebSocket.OPEN) { connect(); return; }
  if (probeTimer) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    giveUpOnSocket();
  }, PROBE_TIMEOUT_MS);
  try { ws.send(JSON.stringify({ type: "ping" })); }
  catch (_) { giveUpOnSocket(); }
}

function giveUpOnSocket() {
  dropSocket();
  setConnectionState("reconnecting");
  connect();
}

export function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  ws = new WebSocket(`ws://${location.host}`);
  const sock = ws;
  ws.onopen = () => {
    const resumed = everOpened;
    everOpened = true;
    wsReady = true;
    while (pendingOpens.length) sock.send(pendingOpens.shift());
    if (resumed) reattachPanes();
    setConnectionState(resumed ? "restored" : "online");
  };
  ws.onclose = () => {
    if (sock !== ws) return;
    wsReady = false;
    clearTimeout(probeTimer);
    probeTimer = null;
    setConnectionState("reconnecting");
    scheduleReconnect();
  };
  ws.onerror = () => { if (sock === ws) try { sock.close(); } catch (_) {} };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "pong":
        clearTimeout(probeTimer);
        probeTimer = null;
        break;
      case "output": {
        const p = state.panes.get(msg.paneId);
        if (!p) return;
        const bytes = b64ToU8(msg.data);
        p.term.write(bytes);
        markPaneReady(msg.paneId, bytes);
        handleActivity(msg.paneId, bytes);
        break;
      }
      case "exit": {
        const p = state.panes.get(msg.paneId);
        if (p) {
          markPaneReady(msg.paneId);
          p.exited = true;
          p.el.classList.add("exited");
          p.term.write("\r\n\x1b[90m[process exited] press Enter to restart\x1b[0m\r\n");
        }
        break;
      }
      case "session":
        restoreSession(msg.layout);
        break;
      case "commands":
        setCustomCommands(Array.isArray(msg.commands) ? msg.commands : []);
        break;
      case "layouts":
        setLayouts(msg.layouts || {});
        refreshOpenPalette();
        break;
      case "meta": {
        const p = state.panes.get(msg.paneId);
        if (p) {
          p.meta = { cwd: msg.cwd || "", branch: msg.branch || "", ports: msg.ports || [], agent: msg.agent || "" };
          const tab = state.tabs.find((t) => t.id === p.tabId);
          if (tab) refreshTabMeta(tab);
        }
        break;
      }
      case "paneCwd":
        deliverPaneCwd(msg.paneId, msg.cwd || "");
        break;
      case "gitStatus":
        setGitStatus(msg);
        break;
      case "gitDiff":
        setGitDiff(msg);
        break;
      case "settings":
        setShortcutOverrides(msg.settings && msg.settings.shortcuts);
        refreshOpenSettings();
        break;
      case "agents":
        setAgents(msg.agents);
        break;
      case "update":
        applyUpdateStatus(msg);
        break;
    }
  };
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) probeConnection(); });
window.addEventListener("focus", probeConnection);
window.addEventListener("online", probeConnection);
