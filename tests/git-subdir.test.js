import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { gitStatus, gitDiff } from "../server/git.js";
import { gitStage, gitUnstage } from "../server/git-commit.js";

function repo(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-subdir-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "test@panea.local");
  git("config", "user.name", "panea tests");
  git("config", "commit.gpgsign", "false");
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "top.txt"), "one\n");
  fs.writeFileSync(path.join(dir, "sub", "a.txt"), "one\n");
  git("add", ".");
  git("commit", "-qm", "init");
  return dir;
}

const kindOf = async (cwd, p) => (await gitStatus(cwd)).files.find((f) => f.path === p)?.kind;

test("from a subdirectory, every changed file still shows its diff", async (t) => {
  const dir = repo(t);
  const cwd = path.join(dir, "sub");
  fs.writeFileSync(path.join(dir, "top.txt"), "two\n");
  fs.writeFileSync(path.join(dir, "sub", "a.txt"), "two\n");
  fs.writeFileSync(path.join(dir, "new.txt"), "fresh\n");

  const files = (await gitStatus(cwd)).files;
  assert.deepEqual(files.map((f) => f.path).sort(), ["new.txt", "sub/a.txt", "top.txt"]);
  for (const f of files) {
    const { patch } = await gitDiff(cwd, f.path, f.kind);
    assert.ok(patch.includes(f.kind === "untracked" ? "+fresh" : "+two"), `empty diff for ${f.path}`);
  }
});

test("from a subdirectory, a staged file shows its staged diff", async (t) => {
  const dir = repo(t);
  const cwd = path.join(dir, "sub");
  fs.writeFileSync(path.join(dir, "top.txt"), "two\n");
  execFileSync("git", ["-C", dir, "add", "top.txt"], { stdio: "pipe" });
  const { patch } = await gitDiff(cwd, "top.txt", "staged");
  assert.match(patch, /\+two/);
});

test("from a subdirectory, stage and unstage act on the file git status named", async (t) => {
  const dir = repo(t);
  const cwd = path.join(dir, "sub");
  fs.writeFileSync(path.join(dir, "top.txt"), "two\n");

  assert.deepEqual(await gitStage(cwd, ["top.txt"]), { ok: true });
  assert.equal(await kindOf(cwd, "top.txt"), "staged");
  assert.deepEqual(await gitUnstage(cwd, ["top.txt"]), { ok: true });
  assert.equal(await kindOf(cwd, "top.txt"), "worktree");
});

test("a file name with glob characters is matched literally", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "a[1].txt"), "x\n");
  fs.writeFileSync(path.join(dir, "a1.txt"), "y\n");
  assert.deepEqual(await gitStage(dir, ["a[1].txt"]), { ok: true });
  assert.equal(await kindOf(dir, "a[1].txt"), "staged");
  assert.equal(await kindOf(dir, "a1.txt"), "untracked");
});
