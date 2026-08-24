

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { STATE_DIR } from "./paths.js";

const REGISTRY = process.env.PANEA_REGISTRY || "https://registry.npmjs.org";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const STAMP = path.join(STATE_DIR, "update-check.json");

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(value).trim());
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}

export function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  if (a.prerelease !== null) return false;
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] > b.parts[i]) return true;
    if (a.parts[i] < b.parts[i]) return false;
  }
  return b.prerelease !== null;
}

function checkedRecently() {
  try {
    const { at } = JSON.parse(fs.readFileSync(STAMP, "utf8"));
    return Date.now() - at < CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

function recordCheck() {
  try {
    fs.writeFileSync(STAMP, JSON.stringify({ at: Date.now() }));
  } catch {}
}

export function isManagedInstall(root) {
  if (fs.existsSync(path.join(root, ".git"))) return false;
  if (path.basename(root) !== "panea") return false;
  if (path.basename(path.dirname(root)) !== "node_modules") return false;
  try {
    fs.accessSync(root, fs.constants.W_OK);
  } catch {
    return false;
  }
  return true;
}

async function latestVersion(name) {
  const res = await fetch(`${REGISTRY}/${name}/latest`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return typeof body.version === "string" ? body.version : null;
}

export async function maybeSelfUpdate({ root, pkg, argv }) {
  if (process.env.PANEA_NO_UPDATE === "1") return;
  if (process.env.PANEA_UPDATED === "1") return;
  if (!isManagedInstall(root)) return;
  if (checkedRecently()) return;

  let latest;
  try {
    latest = await latestVersion(pkg.name);
  } catch {
    return;
  }
  recordCheck();

  if (!latest || !isNewer(latest, pkg.version)) return;

  console.log(`panea ${pkg.version} → ${latest} available, updating…`);

  const install = spawnSync("npm", ["install", "--global", `${pkg.name}@${latest}`], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });

  if (install.status !== 0) {
    const reason = (install.stderr || "")
      .split("\n")
      .map((line) => line.replace(/^npm (error|warn)\s*/, "").trim())
      .find((line) => line && !line.startsWith("A complete log"));
    console.warn(`panea: could not update automatically${reason ? ` (${reason})` : ""}`);
    console.warn(`Run it yourself with:  npm install -g ${pkg.name}@${latest}`);
    console.warn(`Or turn this off with: PANEA_NO_UPDATE=1`);
    return;
  }

  console.log(`panea ${latest} installed, restarting…`);

  const child = spawn(process.execPath, [process.argv[1], ...argv], {
    stdio: "inherit",
    env: { ...process.env, PANEA_UPDATED: "1" },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  await new Promise(() => {});
}
