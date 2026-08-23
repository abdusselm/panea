// Per-WebSocket-connection wiring: owns that client's panes, relays terminal
// I/O, persists layout, serves palette commands, and polls sidebar metadata.

import { Pane } from "./pane.js";
import { loadSession, saveSession } from "./session-store.js";
import { loadCommands } from "./commands-store.js";
import { loadLayouts, saveLayout, deleteLayout } from "./layouts-store.js";
import { computeMetaBatch } from "./meta.js";

const META_POLL_MS = 3500;
const META_FIRST_POLL_MS = 900;

export function handleConnection(ws) {
  const panes = new Map();
  const lastMeta = new Map(); // paneId -> serialized meta

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  // Poll every pane's live context (cwd / branch / ports) from a single shared
  // process snapshot, and push only what changed. One batch keeps spawns at ~3
  // per cycle regardless of how many panes are open.
  let polling = false;
  const pollMeta = async () => {
    if (polling) return;
    const entries = [...panes].filter(([, pane]) => pane.child && pane.child.pid);
    if (!entries.length) return;
    polling = true;
    try {
      const byBridge = await computeMetaBatch(entries.map(([, pane]) => pane.child.pid));
      for (const [id, pane] of entries) {
        if (!panes.has(id)) continue; // pane closed mid-poll
        const meta = byBridge.get(pane.child.pid);
        if (!meta) continue;
        const key = JSON.stringify(meta);
        if (lastMeta.get(id) === key) continue;
        lastMeta.set(id, key);
        send({ type: "meta", paneId: id, ...meta });
      }
    } catch {
      // transient ps/lsof failure — try again next cycle
    } finally {
      polling = false;
    }
  };
  const metaTimer = process.env.PANEA_NO_META_POLL ? null : setInterval(pollMeta, META_POLL_MS);

  // Hand the freshly connected browser the last session, palette commands, and
  // saved layouts.
  send({ type: "session", layout: loadSession() });
  send({ type: "commands", commands: loadCommands() });
  send({ type: "layouts", layouts: loadLayouts() });

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
        // Re-read from disk so palette opens reflect edits without a restart.
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
    }
  });

  ws.on("close", () => {
    if (metaTimer) clearInterval(metaTimer);
    for (const pane of panes.values()) pane.kill();
    panes.clear();
    lastMeta.clear();
  });
}
