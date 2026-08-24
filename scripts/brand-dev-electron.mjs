#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveBundle, packagedBundleDir } from "../server/electron.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PATH_TXT = path.join(ROOT, "node_modules", "electron", "path.txt");
const OUR_ICON = path.join(ROOT, "build", "icon.icns");
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const NAME = "Panea";
const BUNDLE_ID = "io.github.abdusselm.panea";
const RENAME_BUNDLE = process.env.PANEA_RENAME_BUNDLE === "1";

let app = resolveBundle(ROOT);

if (!app) {
  process.exit(0);
}

const DIST = path.dirname(app);
const STOCK_BUNDLE = path.join(DIST, "Electron.app");
const OUR_BUNDLE = path.join(DIST, `${NAME}.app`);
const TRACKS_PATH_TXT = DIST === packagedBundleDir(ROOT);

function plist(...args) {
  return execFileSync("/usr/libexec/PlistBuddy", [...args, path.join(app, "Contents", "Info.plist")], {
    encoding: "utf8",
  }).trim();
}

function setKey(key, value) {
  try {
    plist("-c", `Set :${key} ${value}`);
  } catch {
    plist("-c", `Add :${key} string ${value}`);
  }
}

function writePathTxt() {
  if (!TRACKS_PATH_TXT) return;
  fs.writeFileSync(PATH_TXT, `${path.basename(app)}/Contents/MacOS/${NAME}`);
}

function refreshLaunchServices() {
  const now = new Date();
  fs.utimesSync(app, now, now);
  for (const target of [STOCK_BUNDLE, OUR_BUNDLE]) {
    try {
      execFileSync(LSREGISTER, ["-u", target], { stdio: "ignore" });
    } catch {}
  }
  try {
    execFileSync(LSREGISTER, ["-f", "-R", "-domain", "local", "-domain", "user", app], {
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

  const stockExecutable = path.join(app, "Contents", "MacOS", "Electron");
  const ourExecutable = path.join(app, "Contents", "MacOS", NAME);
  if (fs.existsSync(stockExecutable) && !fs.existsSync(ourExecutable)) {
    fs.renameSync(stockExecutable, ourExecutable);
    setKey("CFBundleExecutable", NAME);
    writePathTxt();
    console.log(`renamed the executable to ${NAME}`);
    changed = true;
  }

  if (RENAME_BUNDLE && app === STOCK_BUNDLE) {
    fs.renameSync(STOCK_BUNDLE, OUR_BUNDLE);
    app = OUR_BUNDLE;
    writePathTxt();
    console.log(`renamed the bundle to ${NAME}.app`);
    changed = true;
  }

  if (!fs.existsSync(OUR_ICON)) {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "make-icon.mjs")], { stdio: "inherit" });
  }

  const icns = path.join(app, "Contents", "Resources", "electron.icns");
  if (fs.existsSync(OUR_ICON) && fs.existsSync(icns)) {
    const ours = fs.readFileSync(OUR_ICON);
    if (!fs.readFileSync(icns).equals(ours)) {
      fs.writeFileSync(icns, ours);
      console.log(`applied ${NAME} Dock icon`);
      changed = true;
    }
  }

  if (changed) refreshLaunchServices();
} catch (err) {
  console.warn(`skipped branding the dev Electron bundle: ${err.message}`);
}
