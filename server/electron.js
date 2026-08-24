

import fs from "node:fs";
import path from "node:path";

import { STATE_DIR } from "./paths.js";

export const USER_ELECTRON_DIR = path.join(STATE_DIR, "electron");

function bundleIn(dir) {
  if (!dir) return null;
  for (const name of ["Panea.app", "Electron.app"]) {
    const bundle = path.join(dir, name);
    if (fs.existsSync(path.join(bundle, "Contents", "Info.plist"))) return bundle;
  }
  return null;
}

export function packagedBundleDir(root) {
  return path.join(root, "node_modules", "electron", "dist");
}

export function resolveBundle(root) {
  return (
    bundleIn(process.env.PANEA_ELECTRON_DIR) ??
    bundleIn(packagedBundleDir(root)) ??
    bundleIn(USER_ELECTRON_DIR)
  );
}

export function executableIn(bundle) {
  const macos = path.join(bundle, "Contents", "MacOS");
  if (!fs.existsSync(macos)) return null;
  for (const name of ["Panea", "Electron"]) {
    const exe = path.join(macos, name);
    if (fs.existsSync(exe)) return exe;
  }
  const [first] = fs.readdirSync(macos);
  return first ? path.join(macos, first) : null;
}

export function resolveExecutable(root) {
  const bundle = resolveBundle(root);
  return bundle ? executableIn(bundle) : null;
}

export function isWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function isHomebrewTree(root) {
  return root.split(path.sep).includes("Cellar");
}

export function targetDirFor(root) {
  if (process.env.PANEA_ELECTRON_DIR) return process.env.PANEA_ELECTRON_DIR;
  if (isHomebrewTree(root)) return USER_ELECTRON_DIR;
  const parent = path.join(root, "node_modules", "electron");
  if (fs.existsSync(parent) && isWritable(parent)) return packagedBundleDir(root);
  return USER_ELECTRON_DIR;
}
