import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { gitStatus } from "../server/git.js";
import { gitStage, gitUnstage, gitStageAll, gitCommit, gitLastCommitMessage } from "../server/git-commit.js";

function repo(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-commit-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "test@panea.local");
  git("config", "user.name", "panea tests");
  git("config", "commit.gpgsign", "false");
  return dir;
}

test("staging a file moves it into the staged list, unstaging moves it back", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");

  assert.deepEqual(await gitStage(dir, ["a.txt"]), { ok: true });
  assert.equal((await gitStatus(dir)).files[0].kind, "staged");

  assert.deepEqual(await gitUnstage(dir, ["a.txt"]), { ok: true });
  assert.equal((await gitStatus(dir)).files[0].kind, "untracked");
});

test("a commit with stageAll picks up everything and leaves a clean tree", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  fs.writeFileSync(path.join(dir, "b.txt"), "b\n");

  const res = await gitCommit(dir, { message: "first", stageAll: true });
  assert.equal(res.ok, true, res.error);
  assert.match(res.head, /first$/);
  assert.equal((await gitStatus(dir)).files.length, 0);
});

test("amend rewrites the last commit and its message is offered back for editing", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  await gitCommit(dir, { message: "first", stageAll: true });

  assert.equal((await gitLastCommitMessage(dir)).message, "first");

  const res = await gitCommit(dir, { message: "first, renamed", amend: true });
  assert.equal(res.ok, true, res.error);
  assert.match(res.head, /first, renamed$/);
  const log = execFileSync("git", ["-C", dir, "log", "--oneline"], { encoding: "utf8" }).trim().split("\n");
  assert.equal(log.length, 1);
});

test("a commit is refused, with a reason, when the message is blank or nothing is staged", async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");

  const blank = await gitCommit(dir, { message: "   " });
  assert.equal(blank.ok, false);
  assert.match(blank.error, /message/);

  const unstaged = await gitCommit(dir, { message: "nope" });
  assert.equal(unstaged.ok, false);
  assert.match(unstaged.error, /staged/);
});

test("paths that climb out of the working directory are never handed to git", async (t) => {
  const dir = repo(t);
  for (const bad of [["../outside.txt"], ["/etc/hosts"], ["a/../../b"]]) {
    assert.equal((await gitStage(dir, bad)).ok, false, `${bad} was staged`);
    assert.equal((await gitUnstage(dir, bad)).ok, false, `${bad} was unstaged`);
  }
});

test("git failures surface git's own message instead of a silent no-op", async (t) => {
  const dir = repo(t);
  const res = await gitStage(dir, ["missing.txt"]);
  assert.equal(res.ok, false);
  assert.match(res.error, /missing\.txt/);
});

test("staging all in a repo with no changes is harmless", async (t) => {
  const dir = repo(t);
  assert.deepEqual(await gitStageAll(dir), { ok: true });
});
