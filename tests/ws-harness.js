import { once } from "node:events";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

import { handleConnection } from "../server/connection.js";

export async function listen(t) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on("connection", handleConnection);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const c of wss.clients) c.terminate();
    wss.close();
    if (server.closeAllConnections) server.closeAllConnections();
    server.close();
  });
  return server.address().port;
}

export async function client(t, port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(ws, "open");
  t.after(() => ws.terminate());
  const waiters = [];
  const seen = [];
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const w = waiters.find((x) => x.match(msg));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); return; }
    seen.push(msg);
  });
  return {
    send: (obj) => ws.send(JSON.stringify(obj)),
    next: (type, ms = 4000) => new Promise((resolve, reject) => {
      const found = seen.find((m) => m.type === type);
      if (found) { seen.splice(seen.indexOf(found), 1); return resolve(found); }
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(w), 1);
        reject(new Error("no " + type));
      }, ms);
      const w = { match: (m) => m.type === type, resolve: (m) => { clearTimeout(timer); resolve(m); } };
      waiters.push(w);
    }),
  };
}
