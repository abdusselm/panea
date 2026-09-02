

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { STATE_DIR, ROOT } from "./paths.js";

const RELEASES =
  process.env.PANEA_RELEASES || "https://api.github.com/repos/abdusselm/panea/releases/latest";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;
const PROGRESS_THROTTLE_MS = 250;
const STAMP = path.join(STATE_DIR, "update-check.json");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

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

export function highestVersion(versions) {
  return versions.reduce((best, value) => {
    if (!parseVersion(value)) return best;
    return best === null || isNewer(value, best) ? value : best;
  }, null);
}

export function relaunchCommand({ name, argv, prefix, entry, exists = fs.existsSync }) {
  const linked = prefix ? path.join(prefix, "bin", name) : null;
  if (linked && exists(linked)) return { command: linked, args: [...argv] };
  if (entry && exists(entry)) return { command: process.execPath, args: [entry, ...argv] };
  return null;
}

export function parseProgressPercent(text) {
  let last = null;
  for (const match of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)) {
    const value = Number(match[1]);
    if (value >= 0 && value <= 100) last = value;
  }
  return last;
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

function forgetCheck() {
  try {
    fs.rmSync(STAMP, { force: true });
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

function installedVersion(name) {
  const out = spawnSync("brew", ["list", "--versions", name], { encoding: "utf8" });
  if (out.status !== 0) return null;
  return highestVersion(out.stdout.trim().split(/\s+/).slice(1));
}

function brewPrefix(name) {
  for (const args of [["--prefix", name], ["--prefix"]]) {
    const out = spawnSync("brew", args, { encoding: "utf8" });
    if (out.status === 0 && out.stdout.trim()) return out.stdout.trim();
  }
  return null;
}

function firstMeaningfulLine(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.replace(/^(npm|Error:)\s*(error|warn)?\s*/i, "").trim())
    .find((line) => line && !line.startsWith("A complete log"));
}

function runWithProgress(command, args, onProgress) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const OUTPUT_CAP = 8192;
    let stderr = "";
    let lastEmit = 0;
    const onChunk = (chunk) => {
      const text = chunk.toString();
      if (stderr.length < OUTPUT_CAP) stderr += text;
      const percent = parseProgressPercent(text);
      const now = Date.now();
      if (percent !== null && now - lastEmit >= PROGRESS_THROTTLE_MS) {
        lastEmit = now;
        onProgress(percent);
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("error", (err) => resolve({ status: 1, stderr: err.message }));
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

let status = { state: "idle" };

export function getUpdateStatus() {
  return status;
}

async function runUpdate({ latest, broadcast }) {
  status = { state: "downloading", version: latest, percent: null };
  broadcast(status);

  await runWithProgress("brew", ["update", "--quiet"], () => {});

  const result = await runWithProgress(
    "brew",
    ["upgrade", "--formula", pkg.name],
    (percent) => {
      status = { state: "downloading", version: latest, percent };
      broadcast(status);
    }
  );

  if (result.status !== 0) {
    forgetCheck();
    const reason = firstMeaningfulLine(result.stderr);
    console.warn(`panea: could not update automatically${reason ? ` (${reason})` : ""}`);
    console.warn(`Run it yourself with:  brew upgrade --formula ${pkg.name}`);
    status = { state: "error", message: reason || "update failed" };
    broadcast(status);
    return;
  }

  const installed = installedVersion(pkg.name);
  if (installed && isNewer(latest, installed)) {
    forgetCheck();
    console.warn(`panea: Homebrew reported success but ${installed} is still what is installed.`);
    console.warn(`The ${latest} formula has not landed in the tap yet — panea will retry next run.`);
    status = { state: "idle" };
    return;
  }

  status = { state: "ready", version: latest };
  broadcast(status);
}

export async function watchForUpdates(broadcast) {
  if (process.env.PANEA_NO_UPDATE === "1") return;

  const kind = detectInstall(ROOT);
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

  await runUpdate({ latest, broadcast });
}
