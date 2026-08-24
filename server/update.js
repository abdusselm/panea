

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { STATE_DIR } from "./paths.js";

const RELEASES =
  process.env.PANEA_RELEASES || "https://api.github.com/repos/abdusselm/panea/releases/latest";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;
const STAMP = path.join(STATE_DIR, "update-check.json");

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(value).trim());
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

export function detectInstall(root) {
  if (fs.existsSync(path.join(root, ".git"))) return null;
  if (!root.split(path.sep).includes("Cellar")) return null;
  return "homebrew";
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

async function latestRelease() {
  const res = await fetch(RELEASES, {
    headers: { accept: "application/vnd.github+json", "user-agent": "panea" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const tag = body.tag_name ?? body.name;
  return typeof tag === "string" ? tag.replace(/^v/, "") : null;
}

function firstMeaningfulLine(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.replace(/^(npm|Error:)\s*(error|warn)?\s*/i, "").trim())
    .find((line) => line && !line.startsWith("A complete log"));
}

export async function maybeSelfUpdate({ root, pkg, argv }) {
  if (process.env.PANEA_NO_UPDATE === "1") return;
  if (process.env.PANEA_UPDATED === "1") return;

  const kind = detectInstall(root);
  if (!kind) return;
  if (checkedRecently()) return;

  let latest;
  try {
    latest = await latestRelease();
  } catch {
    return;
  }
  recordCheck();

  if (!latest || !isNewer(latest, pkg.version)) return;

  console.log(`panea ${pkg.version} → ${latest} available, updating…`);

  spawnSync("brew", ["update", "--quiet"], { stdio: ["ignore", "ignore", "ignore"] });

  const command = "brew";
  const args = ["upgrade", "--formula", pkg.name];
  const upgrade = spawnSync(command, args, {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });

  if (upgrade.status !== 0) {
    const reason = firstMeaningfulLine(upgrade.stderr);
    console.warn(`panea: could not update automatically${reason ? ` (${reason})` : ""}`);
    console.warn(`Run it yourself with:  ${command} ${args.join(" ")}`);
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
