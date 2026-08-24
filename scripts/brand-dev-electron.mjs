#!/usr/bin/env node

// Makes the dev run present itself as panea instead of Electron.
//
// macOS takes the menu-bar title, the Dock label, and the Activity Monitor
// entry from the Info.plist of the bundle that is actually running. Under
// `npm run app` that bundle is node_modules/electron/dist/Electron.app, and no
// Electron API (app.setName included) can override it — so the name is patched
// at the source, in this project's own node_modules.
//
// Deliberately *not* done by building a separate .app: repackaging renames the
// executable, which invalidates the signature Electron ships with. An ad-hoc
// re-sign reads as "unsigned" to managed-Mac security agents, which then demand
// admin rights to launch it. Editing the plist and the icon leaves the signed
// executable untouched, so the app keeps launching exactly as it does today.
//
// Runs from `postinstall`, so a fresh `npm install` re-applies it. Idempotent.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = path.join(ROOT, "node_modules", "electron", "dist", "Electron.app");
const PLIST = path.join(APP, "Contents", "Info.plist");
const ICNS = path.join(APP, "Contents", "Resources", "electron.icns");
const OUR_ICON = path.join(ROOT, "build", "icon.icns");

const NAME = "panea";

// `npm install --omit=dev` and CI installs have no Electron to brand; that is a
// normal state, not a failure.
if (!fs.existsSync(PLIST)) {
  process.exit(0);
}

function plist(...args) {
  return execFileSync("/usr/libexec/PlistBuddy", [...args, PLIST], { encoding: "utf8" }).trim();
}

function setKey(key, value) {
  try {
    plist("-c", `Set :${key} ${value}`);
  } catch {
    plist("-c", `Add :${key} string ${value}`);
  }
}

// Cosmetics must never fail an install: this leans on macOS-only tools
// (PlistBuddy, sips, iconutil), and panea still runs fine unbranded.
try {
  if (plist("-c", "Print :CFBundleName") !== NAME) {
    setKey("CFBundleName", NAME);
    setKey("CFBundleDisplayName", NAME);
    console.log(`branded dev Electron as "${NAME}"`);
  }

  // The Dock icon is the other half of not looking like Electron. Generate it
  // on demand so a fresh clone does not need a checked-in binary.
  if (!fs.existsSync(OUR_ICON)) {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "make-icon.mjs")], { stdio: "inherit" });
  }
  if (fs.existsSync(OUR_ICON) && fs.existsSync(ICNS)) {
    const ours = fs.readFileSync(OUR_ICON);
    if (!fs.readFileSync(ICNS).equals(ours)) {
      fs.writeFileSync(ICNS, ours);
      console.log("applied panea Dock icon");
    }
  }
} catch (err) {
  console.warn(`skipped branding the dev Electron bundle: ${err.message}`);
}
