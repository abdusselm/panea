

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

let ws = null;
let wsReady = false;
const pendingOpens = [];

export function wsSend(obj) {
  const data = JSON.stringify(obj);
  if (wsReady && ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  else if (obj.type === "open") pendingOpens.push(data);
}

export function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => { wsReady = true; while (pendingOpens.length) ws.send(pendingOpens.shift()); };
  ws.onclose = () => { wsReady = false; setTimeout(connect, 1000); };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "output": {
        const p = state.panes.get(msg.paneId);
        if (!p) return;
        const bytes = b64ToU8(msg.data);
        p.term.write(bytes);
        handleActivity(msg.paneId, bytes);
        break;
      }
      case "exit": {
        const p = state.panes.get(msg.paneId);
        if (p) {
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
    }
  };
}
