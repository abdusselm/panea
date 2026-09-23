import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveTreeRoot, listDirs, revealPath, MAX_ENTRIES } from "../server/fs-tree.js";
import { gitStatusFiles } from "../server/git.js";

function tmpDir(t, prefix = "panea-tree-") {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix)));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}

function repo(t) {
  const dir = tmpDir(t);
  execFileSync("git", ["-C", dir, "init", "-q"], { stdio: "pipe" });
  return dir;
}

const names = (listing) => listing.entries.map((e) => e.name);
const entry = (listing, name) => listing.entries.find((e) => e.name === name);

test("the tree root is the repo top level, even from a nested cwd", async (t) => {
  const dir = repo(t);
  fs.mkdirSync(path.join(dir, "a", "b"), { recursive: true });
  assert.deepEqual(await resolveTreeRoot(path.join(dir, "a", "b")), { root: dir, repo: true });
});

test("outside a repo the tree root is the cwd itself", async (t) => {
  const dir = tmpDir(t);
  assert.deepEqual(await resolveTreeRoot(dir), { root: dir, repo: false });
});

test("a missing or empty cwd yields no root rather than throwing", async (t) => {
  const dir = tmpDir(t);
  assert.deepEqual(await resolveTreeRoot(""), { root: "", repo: false });
  assert.deepEqual(await resolveTreeRoot(path.join(dir, "gone")), { root: "", repo: false });
});

test("folders come first, names sort naturally, .git and .DS_Store stay hidden", async (t) => {
  const dir = repo(t);
  for (const f of ["file10.txt", "file2.txt", "B.txt", "a.txt", ".DS_Store", ".env"]) fs.writeFileSync(path.join(dir, f), "");
  fs.mkdirSync(path.join(dir, "zeta"));
  fs.mkdirSync(path.join(dir, "Alpha"));
  const { "": root } = await listDirs(dir, [""]);
  assert.deepEqual(names(root), ["Alpha", "zeta", ".env", "a.txt", "B.txt", "file2.txt", "file10.txt"]);
  assert.equal(entry(root, "zeta").type, "dir");
  assert.equal(entry(root, "a.txt").type, "file");
  assert.equal(root.truncated, 0);
});

test("gitignored entries are flagged, including children of an ignored folder", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n*.log\n");
  fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "");
  fs.writeFileSync(path.join(dir, "src", "debug.log"), "");
  const dirs = await listDirs(dir, ["", "src", "node_modules"]);
  assert.equal(entry(dirs[""], "node_modules").ignored, true);
  assert.equal(entry(dirs[""], "src").ignored, false);
  assert.equal(entry(dirs.src, "debug.log").ignored, true);
  assert.equal(entry(dirs.src, "app.js").ignored, false);
  assert.equal(entry(dirs.node_modules, "pkg").ignored, true);
});

test("a tracked file stays unflagged even if it matches an ignore rule", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, ".gitignore"), "*.log\n");
  fs.writeFileSync(path.join(dir, "kept.log"), "");
  execFileSync("git", ["-C", dir, "add", "-f", "kept.log"], { stdio: "pipe" });
  const { "": root } = await listDirs(dir, [""]);
  assert.equal(entry(root, "kept.log").ignored, false);
});

test("a folder outside a repo still lists, with nothing flagged as ignored", async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, "a.log"), "");
  for (const repo of [true, false]) {
    const { "": root } = await listDirs(dir, [""], { repo });
    assert.deepEqual(names(root), ["a.log"]);
    assert.equal(entry(root, "a.log").ignored, false);
  }
});

test("a path that walks out of the root is refused", async (t) => {
  const dir = repo(t);
  const outside = tmpDir(t);
  const rel = "../" + path.basename(outside);
  const dirs = await listDirs(dir, [rel, outside]);
  assert.equal(dirs[rel].error, "outside");
  assert.equal(dirs[outside].error, "outside");
});

test("a symlinked folder pointing outside the root shows up but cannot be opened", async (t) => {
  const dir = repo(t);
  const outside = tmpDir(t);
  fs.writeFileSync(path.join(outside, "secret.txt"), "");
  fs.symlinkSync(outside, path.join(dir, "escape"));
  const dirs = await listDirs(dir, ["", "escape"]);
  assert.deepEqual(entry(dirs[""], "escape"), { name: "escape", type: "link-dir", ignored: false, outside: true });
  assert.equal(dirs.escape.error, "outside");
});

test("a symlinked folder inside the root opens like a folder", async (t) => {
  const dir = repo(t);
  fs.mkdirSync(path.join(dir, "docs"));
  fs.writeFileSync(path.join(dir, "docs", "readme.md"), "");
  fs.symlinkSync(path.join(dir, "docs"), path.join(dir, "docs-link"));
  fs.symlinkSync(path.join(dir, "missing"), path.join(dir, "broken"));
  const dirs = await listDirs(dir, ["", "docs-link"]);
  assert.equal(entry(dirs[""], "docs-link").type, "link-dir");
  assert.equal(entry(dirs[""], "docs-link").outside, undefined);
  assert.equal(entry(dirs[""], "broken").type, "link-file");
  assert.deepEqual(names(dirs["docs-link"]), ["readme.md"]);
});

test("a huge folder is capped and reports how many entries were left out", async (t) => {
  const dir = tmpDir(t);
  for (let i = 0; i < MAX_ENTRIES + 5; i++) fs.writeFileSync(path.join(dir, `f${i}`), "");
  const { "": root } = await listDirs(dir, [""]);
  assert.equal(root.entries.length, MAX_ENTRIES);
  assert.equal(root.truncated, 5);
});

test("a file or a missing folder answers with an error per entry", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "plain.txt"), "");
  const dirs = await listDirs(dir, ["plain.txt", "nope", ""]);
  assert.equal(dirs["plain.txt"].error, "not a directory");
  assert.equal(dirs.nope.error, "not found");
  assert.ok(dirs[""].entries);
});

test("reveal refuses anything outside the root before touching Finder", async (t) => {
  const dir = repo(t);
  const outside = tmpDir(t);
  fs.symlinkSync(outside, path.join(dir, "escape"));
  assert.deepEqual(await revealPath(dir, "../x"), { ok: false, error: "outside" });
  assert.deepEqual(await revealPath(dir, "escape/x"), { ok: false, error: "outside" });
  assert.deepEqual(await revealPath("", "x"), { ok: false, error: "no root" });
});

test("tree status lists changed paths relative to the repo root", async (t) => {
  const dir = repo(t);
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "new.js"), "");
  const res = await gitStatusFiles(path.join(dir, "src"));
  assert.equal(res.repo, true);
  assert.deepEqual(res.files, [{ path: "src/new.js", x: "?", y: "?", kind: "untracked" }]);
});

test("tree status outside a repo is empty, not an error", async (t) => {
  const dir = tmpDir(t);
  assert.deepEqual(await gitStatusFiles(dir), { repo: false, files: [] });
});
