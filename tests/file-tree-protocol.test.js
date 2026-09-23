import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

import { handleConnection } from "../server/connection.js";

process.env.PANEA_NO_META_POLL = "1";

async function listen(t) {
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

async function client(t, port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(ws, "open");
  t.after(() => ws.terminate());
  const waiters = [];
  const seen = [];
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    seen.push(msg);
    for (const w of [...waiters]) if (w.match(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  return {
    send: (obj) => ws.send(JSON.stringify(obj)),
    next: (type, ms = 4000) => new Promise((resolve, reject) => {
      const found = seen.find((m) => m.type === type);
      if (found) { seen.splice(seen.indexOf(found), 1); return resolve(found); }
      const timer = setTimeout(() => reject(new Error("no " + type)), ms);
      waiters.push({ match: (m) => m.type === type, resolve: (m) => { clearTimeout(timer); seen.splice(seen.indexOf(m), 1); resolve(m); } });
    }),
  };
}

function repo(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-treews-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  execFileSync("git", ["-C", dir, "init", "-q"], { stdio: "pipe" });
  return dir;
}

test("a pane cwd resolves to its repo root and the root lists over the socket", async (t) => {
  const dir = repo(t);
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "a.js"), "");
  const c = await client(t, await listen(t));

  c.send({ type: "getTreeRoot", cwd: path.join(dir, "src") });
  const root = await c.next("treeRoot");
  assert.equal(root.root, dir);
  assert.equal(root.repo, true);

  c.send({ type: "listTree", root: dir, repo: true, dirs: ["", "src"] });
  const listing = await c.next("treeEntries");
  assert.equal(listing.root, dir);
  assert.deepEqual(listing.dirs.src.entries, [{ name: "a.js", type: "file", ignored: false }]);

  c.send({ type: "getTreeStatus", root: dir });
  const status = await c.next("treeStatus");
  assert.deepEqual(status.files.map((f) => f.path), ["src/a.js"]);
});

test("a watched tree reports an external write, and stops after unwatch", async (t) => {
  const dir = repo(t);
  const c = await client(t, await listen(t));
  c.send({ type: "watchTree", root: dir });
  await new Promise((r) => setTimeout(r, 600));

  fs.writeFileSync(path.join(dir, "new.txt"), "x");
  const changed = await c.next("treeChanged");
  assert.equal(changed.root, dir);

  c.send({ type: "unwatchTree" });
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(path.join(dir, "later.txt"), "x");
  await assert.rejects(c.next("treeChanged", 1200));
});
