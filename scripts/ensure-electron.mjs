#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ELECTRON = path.join(ROOT, "node_modules", "electron");
const DIST = path.join(ELECTRON, "dist");
const INSTALLER = path.join(ELECTRON, "install.js");

if (!fs.existsSync(INSTALLER)) {
  process.exit(0);
}

if (fs.existsSync(DIST) && fs.readdirSync(DIST).length > 0) {
  process.exit(0);
}

console.log("downloading the Electron runtime (a few hundred MB, once)…");

const result = spawnSync(process.execPath, [INSTALLER], {
  cwd: ELECTRON,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.warn("panea: could not download the Electron runtime.");
  console.warn("The browser build still works; run `panea` instead of `panea --app`.");
  console.warn(`To retry:  cd ${ELECTRON} && node install.js`);
}
