import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readFileView, loadFileView, MAX_VIEW_BYTES, MAX_HIGHLIGHT_BYTES } from "../server/file-view.js";
import { listen, client } from "./ws-harness.js";

process.env.PANEA_NO_META_POLL = "1";

function tmpDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-view-")));
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
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "one\ntwo\nthree\nfour\nfive\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# hi\n");
  git("add", ".");
  git("commit", "-qm", "init");
  return { dir, git };
}

test("a path from a pane in a subfolder resolves against that pane's cwd", async (t) => {
  const { dir } = repo(t);
  const res = await readFileView({ cwd: path.join(dir, "src"), path: "app.js" });
  assert.equal(res.root, dir);
  assert.equal(res.rel, "src/app.js");
  assert.equal(res.content, "one\ntwo\nthree\nfour\nfive\n");
  assert.equal(res.plain, false);
});

test("a path from the files panel resolves against the tree root", async (t) => {
  const { dir } = repo(t);
  const res = await readFileView({ root: dir, path: "src/app.js" });
  assert.equal(res.rel, "src/app.js");
  assert.ok(res.content);
});

test("an absolute path inside the project opens; one outside it is refused", async (t) => {
  const { dir } = repo(t);
  const outside = tmpDir(t);
  fs.writeFileSync(path.join(outside, "secret.txt"), "nope");
  assert.equal((await readFileView({ cwd: dir, path: path.join(dir, "README.md") })).rel, "README.md");
  const res = await readFileView({ cwd: dir, path: path.join(outside, "secret.txt") });
  assert.equal(res.error, "outside this project");
  assert.equal(res.content, undefined);
});

test("climbing out with .. or through a symlink is refused", async (t) => {
  const { dir } = repo(t);
  const outside = tmpDir(t);
  fs.writeFileSync(path.join(outside, "secret.txt"), "nope");
  fs.symlinkSync(outside, path.join(dir, "escape"));
  assert.equal((await readFileView({ cwd: path.join(dir, "src"), path: "../../" + path.basename(outside) + "/secret.txt" })).error, "outside this project");
  assert.equal((await readFileView({ root: dir, path: "escape/secret.txt" })).error, "outside this project");
});

test("a home-relative path outside the project is refused", async (t) => {
  const { dir } = repo(t);
  assert.equal((await readFileView({ cwd: dir, path: "~/.zshrc" })).error !== undefined, true);
  assert.equal((await readFileView({ cwd: dir, path: "~/.zshrc" })).content, undefined);
});

test("missing files, folders and empty requests answer with an error", async (t) => {
  const { dir } = repo(t);
  assert.equal((await readFileView({ cwd: dir, path: "nope.js" })).error, "not found");
  assert.equal((await readFileView({ cwd: dir, path: "src" })).error, "not a file");
  assert.equal((await readFileView({ cwd: dir })).error, "no path");
  assert.equal((await readFileView({ cwd: path.join(dir, "gone"), path: "a.js" })).error, "no project");
});

test("an oversized file is not sent, a large one is sent without highlighting", async (t) => {
  const { dir } = repo(t);
  fs.writeFileSync(path.join(dir, "huge.txt"), Buffer.alloc(MAX_VIEW_BYTES + 1, 97));
  fs.writeFileSync(path.join(dir, "big.txt"), Buffer.alloc(MAX_HIGHLIGHT_BYTES + 1, 97));
  const huge = await readFileView({ root: dir, path: "huge.txt" });
  assert.equal(huge.tooLarge, true);
  assert.equal(huge.content, undefined);
  const big = await readFileView({ root: dir, path: "big.txt" });
  assert.equal(big.plain, true);
  assert.equal(big.content.length, MAX_HIGHLIGHT_BYTES + 1);
});

test("a binary file is flagged instead of dumped as text", async (t) => {
  const { dir } = repo(t);
  fs.writeFileSync(path.join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
  const res = await readFileView({ root: dir, path: "logo.png" });
  assert.equal(res.binary, true);
  assert.equal(res.content, undefined);
});

test("an unchanged tracked file carries no marks", async (t) => {
  const { dir } = repo(t);
  const res = await loadFileView({ root: dir, path: "src/app.js" });
  assert.deepEqual([res.allAdded, res.marks], [false, []]);
});

test("edited, inserted and deleted lines come back as gutter marks", async (t) => {
  const { dir } = repo(t);
  fs.writeFileSync(path.join(dir, "src", "app.js"), "one\nTWO\nthree\nnew a\nnew b\nfour\n");
  const res = await loadFileView({ cwd: path.join(dir, "src"), path: "app.js" });
  assert.equal(res.allAdded, false);
  assert.deepEqual(res.marks, [
    { start: 2, count: 1, kind: "mod" },
    { start: 4, count: 2, kind: "add" },
    { start: 7, count: 0, kind: "del" },
  ]);
});

test("staged and unstaged edits both count against the last commit", async (t) => {
  const { dir, git } = repo(t);
  fs.writeFileSync(path.join(dir, "src", "app.js"), "ONE\ntwo\nthree\nfour\nfive\n");
  git("add", "src/app.js");
  fs.writeFileSync(path.join(dir, "src", "app.js"), "ONE\ntwo\nthree\nfour\nFIVE\n");
  const res = await loadFileView({ root: dir, path: "src/app.js" });
  assert.deepEqual(res.marks.map((m) => m.start), [1, 5]);
});

test("a new file, untracked or freshly staged, is marked as added throughout", async (t) => {
  const { dir, git } = repo(t);
  fs.writeFileSync(path.join(dir, "fresh.js"), "a\nb\n");
  fs.writeFileSync(path.join(dir, "staged.js"), "c\n");
  git("add", "staged.js");
  assert.equal((await loadFileView({ root: dir, path: "fresh.js" })).allAdded, true);
  assert.equal((await loadFileView({ root: dir, path: "staged.js" })).allAdded, true);
});

test("outside a git repo a file still opens, without marks", async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, "notes.txt"), "hello\n");
  const res = await loadFileView({ cwd: dir, path: "notes.txt" });
  assert.equal(res.content, "hello\n");
  assert.deepEqual([res.allAdded, res.marks], [false, []]);
});

test("a file view round-trips over the socket with its request id", async (t) => {
  const { dir } = repo(t);
  fs.writeFileSync(path.join(dir, "README.md"), "# hi\nmore\n");
  const c = await client(t, await listen(t));
  c.send({ type: "getFileView", reqId: 7, cwd: dir, path: "README.md" });
  const msg = await c.next("fileView");
  assert.equal(msg.reqId, 7);
  assert.equal(msg.rel, "README.md");
  assert.deepEqual(msg.marks, [{ start: 2, count: 1, kind: "add" }]);
});

test("a watched view reports an external write, and stops after unwatch", async (t) => {
  const { dir } = repo(t);
  const c = await client(t, await listen(t));
  c.send({ type: "watchView", root: dir });
  await new Promise((r) => setTimeout(r, 600));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "changed\n");
  assert.equal((await c.next("viewChanged")).root, dir);
  c.send({ type: "unwatchView" });
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "again\n");
  await assert.rejects(c.next("viewChanged", 1200));
});
