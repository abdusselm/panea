import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { listProjectFiles } from "../server/file-list.js";
import { listen, client } from "./ws-harness.js";

process.env.PANEA_NO_META_POLL = "1";

function tmpDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-list-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}

function repo(t) {
  const dir = tmpDir(t);
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "test@panea.local");
  git("config", "user.name", "panea tests");
  git("config", "commit.gpgsign", "false");
  fs.mkdirSync(path.join(dir, "src", "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gitignore"), "dist/\n*.log\n");
  fs.writeFileSync(path.join(dir, "src", "app.js"), "a\n");
  fs.writeFileSync(path.join(dir, "src", "lib", "util.js"), "b\n");
  fs.writeFileSync(path.join(dir, "gone.txt"), "c\n");
  git("add", ".");
  git("commit", "-qm", "init");
  return { dir, git };
}

test("a repo lists tracked and new files, not ignored or deleted ones", async (t) => {
  const { dir } = repo(t);
  fs.writeFileSync(path.join(dir, "new.md"), "");
  fs.mkdirSync(path.join(dir, "dist"));
  fs.writeFileSync(path.join(dir, "dist", "bundle.js"), "");
  fs.writeFileSync(path.join(dir, "debug.log"), "");
  fs.rmSync(path.join(dir, "gone.txt"));
  const res = await listProjectFiles({ cwd: path.join(dir, "src", "lib") });
  assert.equal(res.root, dir);
  assert.equal(res.repo, true);
  assert.deepEqual(res.files.sort(), [".gitignore", "new.md", "src/app.js", "src/lib/util.js"]);
  assert.equal(res.truncated, false);
});

test("a long list is capped and says so", async (t) => {
  const { dir } = repo(t);
  const res = await listProjectFiles({ root: dir }, { max: 2 });
  assert.equal(res.files.length, 2);
  assert.equal(res.truncated, true);
});

test("outside a repo the folder is walked, skipping node_modules and .git", async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, "a", "b"), { recursive: true });
  fs.mkdirSync(path.join(dir, "node_modules", "x"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, "a", "b", "deep.txt"), "");
  fs.writeFileSync(path.join(dir, "top.txt"), "");
  fs.writeFileSync(path.join(dir, "node_modules", "x", "index.js"), "");
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "");
  const res = await listProjectFiles({ cwd: dir });
  assert.equal(res.repo, false);
  assert.deepEqual(res.files.sort(), ["a/b/deep.txt", "top.txt"]);
  assert.equal(res.truncated, false);
});

test("a walk that hits the cap reports it as truncated", async (t) => {
  const dir = tmpDir(t);
  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(dir, `f${i}.txt`), "");
  const res = await listProjectFiles({ root: dir }, { max: 3 });
  assert.equal(res.files.length, 3);
  assert.equal(res.truncated, true);
});

test("no cwd or a missing folder answers with an error", async (t) => {
  const dir = tmpDir(t);
  assert.equal((await listProjectFiles({})).error, "no project");
  assert.equal((await listProjectFiles({ cwd: path.join(dir, "gone") })).error, "no project");
});

test("the list round-trips over the socket with its request id", async (t) => {
  const { dir } = repo(t);
  const c = await client(t, await listen(t));
  c.send({ type: "listFiles", reqId: 3, cwd: dir });
  const msg = await c.next("fileList");
  assert.equal(msg.reqId, 3);
  assert.equal(msg.root, dir);
  assert.ok(msg.files.includes("src/app.js"));
});
