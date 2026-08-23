

import { Pane } from "./pane.js";
import { loadSession, saveSession } from "./session-store.js";
import { loadCommands } from "./commands-store.js";
import { loadLayouts, saveLayout, deleteLayout } from "./layouts-store.js";
import { loadSettings, saveSettings } from "./settings-store.js";
import { loadAgents } from "./agents-store.js";
import { computeMetaBatch } from "./meta.js";
import { gitStatus, gitDiff } from "./git.js";

const META_POLL_MS = 3500;
const META_FIRST_POLL_MS = 900;

export function handleConnection(ws) {
  const panes = new Map();
  const lastMeta = new Map();

  const agents = loadAgents();

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  let polling = false;
  const pollMeta = async () => {
    if (polling) return;
    const entries = [...panes].filter(([, pane]) => pane.child && pane.child.pid);
    if (!entries.length) return;
    polling = true;
    try {
      const byBridge = await computeMetaBatch(entries.map(([, pane]) => pane.child.pid), agents);
      for (const [id, pane] of entries) {
        if (!panes.has(id)) continue;
        const meta = byBridge.get(pane.child.pid);
        if (!meta) continue;
        const key = JSON.stringify(meta);
        if (lastMeta.get(id) === key) continue;
        lastMeta.set(id, key);
        send({ type: "meta", paneId: id, ...meta });
      }
    } catch {

    } finally {
      polling = false;
    }
  };
  const metaTimer = process.env.PANEA_NO_META_POLL ? null : setInterval(pollMeta, META_POLL_MS);

  send({ type: "session", layout: loadSession() });
  send({ type: "commands", commands: loadCommands() });
  send({ type: "layouts", layouts: loadLayouts() });
  send({ type: "settings", settings: loadSettings() });
  send({ type: "agents", agents });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "open": {
        if (panes.has(msg.paneId)) return;
        const pane = new Pane(
          msg.paneId,
          { cwd: msg.cwd, cols: msg.cols, rows: msg.rows },
          (data) => send({ type: "output", paneId: msg.paneId, data: data.toString("base64") }),
          (code) => {
            panes.delete(msg.paneId);
            send({ type: "exit", paneId: msg.paneId, code });
          }
        );
        panes.set(msg.paneId, pane);
        if (!process.env.PANEA_NO_META_POLL) setTimeout(() => pollMeta(), META_FIRST_POLL_MS);
        break;
      }
      case "input": {
        const pane = panes.get(msg.paneId);
        if (pane) pane.write(Buffer.from(msg.data, "base64"));
        break;
      }
      case "resize": {
        const pane = panes.get(msg.paneId);
        if (pane) pane.resize(msg.cols, msg.rows);
        break;
      }
      case "close": {
        const pane = panes.get(msg.paneId);
        if (pane) { pane.kill(); panes.delete(msg.paneId); lastMeta.delete(msg.paneId); }
        break;
      }
      case "session": {
        saveSession(msg.layout);
        break;
      }
      case "getCommands": {

        send({ type: "commands", commands: loadCommands() });
        break;
      }
      case "getLayouts": {
        send({ type: "layouts", layouts: loadLayouts() });
        break;
      }
      case "saveLayout": {
        send({ type: "layouts", layouts: saveLayout(msg.name, msg.layout) });
        break;
      }
      case "deleteLayout": {
        send({ type: "layouts", layouts: deleteLayout(msg.name) });
        break;
      }
      case "getSettings": {
        send({ type: "settings", settings: loadSettings() });
        break;
      }
      case "saveSettings": {
        send({ type: "settings", settings: saveSettings(msg.settings) });
        break;
      }
      case "getGitStatus": {

        gitStatus(msg.cwd).then((res) => send({ type: "gitStatus", cwd: msg.cwd, ...res }));
        break;
      }
      case "getGitDiff": {
        gitDiff(msg.cwd, msg.path, msg.mode).then((res) =>
          send({ type: "gitDiff", cwd: msg.cwd, path: msg.path, ...res })
        );
        break;
      }
    }
  });

  ws.on("close", () => {
    if (metaTimer) clearInterval(metaTimer);
    for (const pane of panes.values()) pane.kill();
    panes.clear();
    lastMeta.clear();
  });
}
