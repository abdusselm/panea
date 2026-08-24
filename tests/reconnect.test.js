import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";

import { handleConnection } from "../server/connection.js";
import { livePane, killAll } from "../server/pane-registry.js";

process.env.PANEA_NO_META_POLL = "1";
process.env.PANEA_NO_THEME = "1";
process.env.SHELL = "/bin/sh";

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function listen(t) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on("connection", handleConnection);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    killAll();
    for (const client of wss.clients) client.terminate();
    wss.close();
    if (server.closeAllConnections) server.closeAllConnections();
    server.close();
  });
  return server.address().port;
}

async function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(ws, "open");
  const seen = [];
  ws.on("message", (raw) => {
    try { seen.push(JSON.parse(raw)); } catch {}
  });
  const api = {
    ws,
    seen,
    send: (obj) => ws.send(JSON.stringify(obj)),
    type: (paneId, text) =>
      ws.send(JSON.stringify({ type: "input", paneId, data: Buffer.from(text).toString("base64") })),
    text: (paneId) =>
      seen
        .filter((m) => m.type === "output" && m.paneId === paneId)
        .map((m) => Buffer.from(m.data, "base64").toString("utf8"))
        .join(""),
    bye: async () => { ws.close(); await once(ws, "close"); },
  };
  return api;
}

async function waitFor(fn, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
  return null;
}

test("a dropped socket does not kill the pane, and reattaching resumes it", async (t) => {
  const port = await listen(t);
  const paneId = "pane-reconnect";

  const first = await client(port);
  first.send({ type: "open", paneId, cols: 80, rows: 24 });
  const pane = await waitFor(() => livePane(paneId), 5000);
  assert.ok(pane, "the server never opened the pane");
  const pid = pane.child.pid;

  first.type(paneId, "echo MARK_ONE\n");
  assert.ok(
    await waitFor(() => first.text(paneId).includes("MARK_ONE\r\n")),
    "shell never ran the first command"
  );

  await first.bye();
  await new Promise((r) => setTimeout(r, 500));

  assert.ok(alive(pid), "the shell was killed when the socket dropped");

  const second = await client(port);
  second.send({ type: "attach", paneId, cols: 80, rows: 24 });

  const exited = await waitFor(
    () => second.seen.find((m) => m.type === "exit" && m.paneId === paneId),
    600
  );
  assert.equal(exited, null, "reattach reported the pane as dead");

  second.type(paneId, "echo MARK_TWO\n");
  assert.ok(
    await waitFor(() => second.text(paneId).includes("MARK_TWO\r\n")),
    "input after reconnect never reached the shell"
  );

  await second.bye();
});

test("output produced while detached is replayed on reattach", async (t) => {
  const port = await listen(t);
  const paneId = "pane-buffered";

  const first = await client(port);
  first.send({ type: "open", paneId, cols: 80, rows: 24 });

  first.type(paneId, "echo READY\n");
  assert.ok(await waitFor(() => first.text(paneId).includes("READY\r\n")), "shell never started");

  first.type(paneId, "echo ARMED; sleep 2; echo WHILE_AWAY\n");
  assert.ok(
    await waitFor(() => first.text(paneId).includes("ARMED\r\n")),
    "the shell never began running the command we detach from"
  );
  await first.bye();

  await new Promise((r) => setTimeout(r, 3500));

  const second = await client(port);
  second.send({ type: "attach", paneId, cols: 80, rows: 24 });
  assert.ok(
    await waitFor(() => second.text(paneId).includes("WHILE_AWAY")),
    "output produced while detached was lost"
  );

  await second.bye();
});

test("attaching to a pane the server never had reports an exit", async (t) => {
  const port = await listen(t);
  const paneId = "pane-that-never-existed";

  const c = await client(port);
  c.send({ type: "attach", paneId, cols: 80, rows: 24 });

  assert.ok(
    await waitFor(() => c.seen.find((m) => m.type === "exit" && m.paneId === paneId), 3000),
    "a missing pane must be reported as exited, not silently ignored"
  );

  await c.bye();
});

test("closing a pane kills its shell", async (t) => {
  const port = await listen(t);
  const paneId = "pane-close";

  const c = await client(port);
  c.send({ type: "open", paneId, cols: 80, rows: 24 });

  const pane = await waitFor(() => livePane(paneId), 5000);
  assert.ok(pane, "the server never opened the pane");
  const pid = pane.child.pid;
  assert.ok(alive(pid));

  c.send({ type: "close", paneId });
  assert.ok(await waitFor(() => !alive(pid)), "close left the shell running");
  assert.equal(livePane(paneId), null, "a closed pane stayed in the registry");

  await c.bye();
});
