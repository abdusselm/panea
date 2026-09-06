import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { handleConnection } from "../server/connection.js";
import { killAll } from "../server/pane-registry.js";

process.env.PANEA_NO_META_POLL = "1";

async function listen(t) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on("connection", handleConnection);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    killAll();
    for (const c of wss.clients) c.terminate();
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
  ws.on("message", (raw) => { try { seen.push(JSON.parse(raw)); } catch {} });
  return {
    send: (obj) => ws.send(JSON.stringify(obj)),
    seen,
    bye: async () => { ws.close(); await once(ws, "close"); },
  };
}

async function waitFor(fn, ms = 3000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
}

function tmpDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-getfile-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}

test("getFileContent answers for a real markdown file", async (t) => {
  const port = await listen(t);
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, "notes.md"), "# hi\n");
  const c = await client(port);

  c.send({ type: "getFileContent", cwd: dir, path: "notes.md" });
  const reply = await waitFor(() => c.seen.find((m) => m.type === "fileContent"));
  assert.ok(reply, "server never answered getFileContent");
  assert.equal(reply.ok, true);
  assert.equal(reply.content, "# hi\n");

  await c.bye();
});

test("getFileContent answers instead of leaving the client hanging when cwd is malformed", async (t) => {
  const port = await listen(t);
  const c = await client(port);

  c.send({ type: "getFileContent", cwd: 12345, path: "notes.md" });
  const reply = await waitFor(() => c.seen.find((m) => m.type === "fileContent"));
  assert.ok(reply, "a malformed request left the preview stuck loading forever");
  assert.equal(reply.ok, false);

  await c.bye();
});
