

import { openPane, attachPane, detachPane, livePane, closePane } from "./pane-registry.js";
import { keepAlive } from "./keepalive.js";
import { loadSession, saveSession } from "./session-store.js";
import { loadCommands } from "./commands-store.js";
import { loadLayouts, saveLayout, deleteLayout } from "./layouts-store.js";
import { loadSettings, saveSettings } from "./settings-store.js";
import { loadAgents } from "./agents-store.js";
import { computeMetaBatch, cwdOfBridge } from "./meta.js";
import { gitStatus, gitDiff } from "./git.js";

const META_POLL_MS = 3500;
const META_FIRST_POLL_MS = 900;

export function handleConnection(ws) {
  const attached = new Map();
  const lastMeta = new Map();

  const agents = loadAgents();

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const bind = (paneId) => {
    const sink = {
      output: (data) => send({ type: "output", paneId, data: data.toString("base64") }),
      exit: (code) => send({ type: "exit", paneId, code }),
    };
    const entry = attachPane(paneId, sink);
    if (entry) attached.set(paneId, sink);
    return entry;
  };

  let polling = false;
  const pollMeta = async () => {
    if (polling) return;
    const entries = [...attached.keys()]
      .map((id) => [id, livePane(id)])
      .filter(([, pane]) => pane && pane.child && pane.child.pid);
    if (!entries.length) return;
    polling = true;
    try {
      const byBridge = await computeMetaBatch(entries.map(([, pane]) => pane.child.pid), agents);
      for (const [id, pane] of entries) {
        if (!attached.has(id)) continue;
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
        if (attached.has(msg.paneId) && livePane(msg.paneId)) return;
        openPane(msg.paneId, { cwd: msg.cwd, cols: msg.cols, rows: msg.rows });
        bind(msg.paneId);
        if (!process.env.PANEA_NO_META_POLL) setTimeout(() => pollMeta(), META_FIRST_POLL_MS);
        break;
      }
      case "attach": {
        lastMeta.delete(msg.paneId);
        if (!bind(msg.paneId)) {
          attached.delete(msg.paneId);
          send({ type: "exit", paneId: msg.paneId, code: 0 });
          break;
        }
        const pane = livePane(msg.paneId);
        if (pane && msg.cols && msg.rows) pane.resize(msg.cols, msg.rows);
        if (!process.env.PANEA_NO_META_POLL) setTimeout(() => pollMeta(), META_FIRST_POLL_MS);
        break;
      }
      case "ping": {
        send({ type: "pong" });
        break;
      }
      case "getPaneCwd": {
        const pane = livePane(msg.paneId);
        const pid = pane && pane.child && pane.child.pid;
        const reply = (cwd) => send({ type: "paneCwd", paneId: msg.paneId, cwd });
        if (!pid) { reply(""); break; }
        cwdOfBridge(pid).then(reply, () => reply(""));
        break;
      }
      case "input": {
        const pane = livePane(msg.paneId);
        if (pane) pane.write(Buffer.from(msg.data, "base64"));
        break;
      }
      case "resize": {
        const pane = livePane(msg.paneId);
        if (pane) pane.resize(msg.cols, msg.rows);
        break;
      }
      case "close": {
        closePane(msg.paneId);
        attached.delete(msg.paneId);
        lastMeta.delete(msg.paneId);
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

  const stopKeepAlive = keepAlive(ws);

  ws.on("close", () => {
    stopKeepAlive();
    if (metaTimer) clearInterval(metaTimer);
    for (const [id, sink] of attached) detachPane(id, sink);
    attached.clear();
    lastMeta.clear();
  });
}
