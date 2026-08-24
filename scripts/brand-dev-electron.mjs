#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = path.join(ROOT, "node_modules", "electron", "dist", "Electron.app");
const PLIST = path.join(APP, "Contents", "Info.plist");
const ICNS = path.join(APP, "Contents", "Resources", "electron.icns");
const OUR_ICON = path.join(ROOT, "build", "icon.icns");
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const NAME = "Panea";
const BUNDLE_ID = "io.github.abdusselamkeskin.panea";

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

function refreshLaunchServices() {
  const now = new Date();
  fs.utimesSync(APP, now, now);
  try {
    execFileSync(LSREGISTER, ["-u", APP], { stdio: "ignore" });
  } catch {}
  try {
    execFileSync(LSREGISTER, ["-f", "-R", "-domain", "local", "-domain", "user", APP], {
      stdio: "ignore",
    });
  } catch {}
  try {
    execFileSync("killall", ["Dock"], { stdio: "ignore" });
  } catch {}
}

try {
  let changed = false;

  if (plist("-c", "Print :CFBundleName") !== NAME) {
    setKey("CFBundleName", NAME);
    setKey("CFBundleDisplayName", NAME);
    console.log(`branded dev Electron as "${NAME}"`);
    changed = true;
  }

  if (plist("-c", "Print :CFBundleIdentifier") !== BUNDLE_ID) {
    setKey("CFBundleIdentifier", BUNDLE_ID);
    console.log(`set bundle id to ${BUNDLE_ID}`);
    changed = true;
  }

  if (!fs.existsSync(OUR_ICON)) {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "make-icon.mjs")], { stdio: "inherit" });
  }

  if (fs.existsSync(OUR_ICON) && fs.existsSync(ICNS)) {
    const ours = fs.readFileSync(OUR_ICON);
    if (!fs.readFileSync(ICNS).equals(ours)) {
      fs.writeFileSync(ICNS, ours);
      console.log(`applied ${NAME} Dock icon`);
      changed = true;
    }
  }

  if (changed) refreshLaunchServices();
} catch (err) {
  console.warn(`skipped branding the dev Electron bundle: ${err.message}`);
}
