import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startGitWatch, isRelevantChange } from "../server/git-watch.js";

const SETTLE_MS = 900;

function repo(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-watch-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  execFileSync("git", ["-C", dir, "init", "-q"], { stdio: "pipe" });
  return dir;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("a file written by another editor wakes the git panel", async (t) => {
  const dir = repo(t);
  let hits = 0;
  const stop = startGitWatch(dir, () => hits++);
  t.after(stop);
  await sleep(SETTLE_MS);

  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  await sleep(SETTLE_MS);
  assert.ok(hits > 0, "an external write never reached the panel");
});

test("a burst of writes collapses into one refresh", async (t) => {
  const dir = repo(t);
  let hits = 0;
  const stop = startGitWatch(dir, () => hits++);
  t.after(stop);
  await sleep(SETTLE_MS);

  for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(dir, `f${i}.txt`), "x\n");
  await sleep(SETTLE_MS);
  assert.equal(hits, 1, `20 writes produced ${hits} refreshes`);
});

test("a closed panel stops being told about changes", async (t) => {
  const dir = repo(t);
  let hits = 0;
  const stop = startGitWatch(dir, () => hits++);
  await sleep(SETTLE_MS);
  stop();

  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  await sleep(SETTLE_MS);
  assert.equal(hits, 0, "a stopped watch kept firing");
});

test("watching from a subdirectory still sees changes anywhere in the repo", async (t) => {
  const dir = repo(t);
  const sub = path.join(dir, "src", "deep");
  fs.mkdirSync(sub, { recursive: true });
  let hits = 0;
  const stop = startGitWatch(sub, () => hits++);
  t.after(stop);
  await sleep(SETTLE_MS);

  fs.writeFileSync(path.join(dir, "top.txt"), "a\n");
  await sleep(SETTLE_MS);
  assert.ok(hits > 0, "a change outside the subdirectory was missed");
});

test("git's own object churn and node_modules do not trigger refreshes", () => {
  assert.equal(isRelevantChange(".git/objects/ab/cdef"), false);
  assert.equal(isRelevantChange(".git/logs/HEAD"), false);
  assert.equal(isRelevantChange("node_modules/ws/index.js"), false);
  assert.equal(isRelevantChange("src/.DS_Store"), false);

  assert.equal(isRelevantChange(".git/index"), true);
  assert.equal(isRelevantChange(".git/HEAD"), true);
  assert.equal(isRelevantChange(".git/refs/heads/main"), true);
  assert.equal(isRelevantChange("src/app.js"), true);
});
