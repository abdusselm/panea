import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";

import { handleConnection } from "../server/connection.js";
import { livePane, killAll } from "../server/pane-registry.js";

process.env.PANEA_NO_META_POLL = "1";
process.env.PANEA_NO_THEME = "1";
process.env.SHELL = "/bin/sh";

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
  return {
    seen,
    send: (obj) => ws.send(JSON.stringify(obj)),
    type: (paneId, text) =>
      ws.send(JSON.stringify({ type: "input", paneId, data: Buffer.from(text).toString("base64") })),
    text: (paneId) =>
      seen
        .filter((m) => m.type === "output" && m.paneId === paneId)
        .map((m) => Buffer.from(m.data, "base64").toString("utf8"))
        .join(""),
    cwdReply: (paneId) => seen.find((m) => m.type === "paneCwd" && m.paneId === paneId),
  };
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

test("a split asks for the pane's directory and is told where the shell moved to", async (t) => {
  const start = fs.realpathSync(os.tmpdir());
  const moved = fs.realpathSync(fs.mkdtempSync(`${start}/panea-split-`));
  t.after(() => { try { fs.rmSync(moved, { recursive: true, force: true }); } catch {} });

  const port = await listen(t);
  const paneId = "pane-split-source";
  const api = await client(port);

  api.send({ type: "open", paneId, cwd: start, cols: 80, rows: 24 });
  assert.ok(await waitFor(() => livePane(paneId), 5000), "the server never opened the pane");

  api.type(paneId, "echo REA''DY\n");
  assert.ok(await waitFor(() => api.text(paneId).includes("READY\r\n")), "shell never came up");

  api.send({ type: "getPaneCwd", paneId });
  const atStart = await waitFor(() => api.cwdReply(paneId));
  assert.equal(atStart.cwd, start, "a pane that has not moved reports where it opened");

  api.seen.length = 0;
  api.type(paneId, `cd ${moved} && echo MOV''ED\n`);
  assert.ok(await waitFor(() => api.text(paneId).includes("MOVED\r\n")), "shell never changed directory");

  api.send({ type: "getPaneCwd", paneId });
  const afterCd = await waitFor(() => api.cwdReply(paneId));
  assert.equal(afterCd.cwd, moved, "the split must open where the shell is now, not where it started");
});

test("asking about a pane that is not open answers instead of hanging the split", async (t) => {
  const port = await listen(t);
  const api = await client(port);

  api.send({ type: "getPaneCwd", paneId: "pane-that-never-was" });
  const reply = await waitFor(() => api.cwdReply("pane-that-never-was"), 5000);
  assert.ok(reply, "the server must always answer, so the split can fall back");
  assert.equal(reply.cwd, "");
});
