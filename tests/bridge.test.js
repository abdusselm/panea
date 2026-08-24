import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PY, BRIDGE } from "../server/paths.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function childrenOf(pid) {
  try {
    return execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}

async function settled(pid, ms = 6000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !alive(pid);
}

async function firstOutput(stream, ms = 8000) {
  const timer = new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.race([once(stream, "data"), timer]);
}

test("the bridge exits when the pipe to its parent closes", async () => {
  const bridge = spawn(PY, [BRIDGE, "/bin/zsh"], { stdio: ["pipe", "pipe", "ignore", "pipe"] });
  await firstOutput(bridge.stdout);

  const shell = childrenOf(bridge.pid);
  bridge.stdin.end();

  const [code] = await once(bridge, "exit");
  assert.equal(typeof code, "number");
  for (const pid of shell) assert.equal(await settled(pid), true, `shell ${pid} outlived the bridge`);
});

test("a killed server takes its panes with it instead of orphaning them", async () => {
  const paneUrl = pathToFileURL(path.join(ROOT, "server", "pane.js")).href;
  const server = spawn(process.execPath, [
    "-e",
    `import(${JSON.stringify(paneUrl)}).then(({ Pane }) => {
       const pane = new Pane("t", {}, () => {}, () => {});
       process.stdout.write(pane.child.pid + "\\n");
       setInterval(() => {}, 1000);
     });`,
  ], { stdio: ["ignore", "pipe", "ignore"] });

  const [chunk] = await once(server.stdout, "data");
  const bridgePid = Number(String(chunk).trim());
  assert.ok(alive(bridgePid), "the bridge should be running before the server dies");

  server.kill("SIGKILL");
  await once(server, "exit");

  assert.equal(await settled(bridgePid), true, "the bridge outlived the server that spawned it");
});
