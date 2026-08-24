#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveBundle, targetDirFor, packagedBundleDir } from "../server/electron.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

if (resolveBundle(ROOT)) {
  process.exit(0);
}

const target = targetDirFor(ROOT);
const version = JSON.parse(
  fs.readFileSync(path.join(ROOT, "node_modules", "electron", "package.json"), "utf8"),
).version;

console.log(`downloading the Electron ${version} runtime (a few hundred MB, once)…`);

let downloadArtifact;
try {
  ({ downloadArtifact } = require("@electron/get"));
} catch {
  console.warn("panea: @electron/get is missing, cannot fetch the Electron runtime.");
  console.warn("The browser build still works; run `panea` instead of `panea --app`.");
  process.exit(0);
}

let zip;
try {
  zip = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: process.platform,
    arch: process.arch,
  });
} catch (err) {
  console.warn(`panea: could not download the Electron runtime (${err.message}).`);
  console.warn("The browser build still works; run `panea` instead of `panea --app`.");
  process.exit(0);
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "panea-electron-"));

try {
  execFileSync("ditto", ["-x", "-k", zip, staging], { stdio: "inherit" });

  const unpacked = path.join(staging, "Electron.app");
  if (!fs.existsSync(unpacked)) throw new Error("the archive contained no Electron.app");

  fs.mkdirSync(target, { recursive: true });
  const destination = path.join(target, "Electron.app");
  fs.rmSync(destination, { recursive: true, force: true });
  fs.renameSync(unpacked, destination);

  for (const extra of fs.readdirSync(staging)) {
    fs.renameSync(path.join(staging, extra), path.join(target, extra));
  }

  if (target !== packagedBundleDir(ROOT)) {
    fs.writeFileSync(path.join(target, "version"), version);
  }

  console.log(`Electron ${version} installed into ${target}`);
} catch (err) {
  console.warn(`panea: could not unpack the Electron runtime (${err.message}).`);
  console.warn("The browser build still works; run `panea` instead of `panea --app`.");
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
