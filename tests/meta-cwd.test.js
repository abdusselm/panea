import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";

import { PY, BRIDGE } from "../server/paths.js";
import { cwdOfBridge } from "../server/meta.js";

async function firstOutput(stream, ms = 8000) {
  const timer = new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.race([once(stream, "data"), timer]);
}

async function settleOn(bridgePid, want, ms = 8000) {
  const deadline = Date.now() + ms;
  let seen = "";
  while (Date.now() < deadline) {
    seen = await cwdOfBridge(bridgePid);
    if (seen === want) return seen;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return seen;
}

test("a pane's directory is read live, not from where its shell started", async (t) => {
  const start = fs.realpathSync(os.tmpdir());
  const moved = fs.realpathSync(fs.mkdtempSync(`${start}/panea-cwd-`));
  t.after(() => { try { fs.rmSync(moved, { recursive: true, force: true }); } catch {} });

  const bridge = spawn(PY, [BRIDGE, "/bin/sh"], { cwd: start, stdio: ["pipe", "pipe", "ignore", "pipe"] });
  t.after(() => { try { bridge.kill("SIGKILL"); } catch {} });
  bridge.stdout.resume();
  await firstOutput(bridge.stdout);

  assert.equal(await settleOn(bridge.pid, start), start, "the shell must be found where it started");

  bridge.stdin.write(`cd ${moved}\n`);
  assert.equal(
    await settleOn(bridge.pid, moved),
    moved,
    "a split must inherit where the shell is now, not where it was opened",
  );
});

test("a pane that is gone reports no directory instead of throwing", async () => {
  assert.equal(await cwdOfBridge(0), "");
  assert.equal(await cwdOfBridge(null), "");
});
