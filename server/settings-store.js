

import fs from "node:fs";
import { SETTINGS_FILE } from "./paths.js";

const CHORD_RE = /^Cmd(-Shift)?(-Alt)?(-Ctrl)?-[A-Z]$/;

function sanitize(settings) {
  const out = {};
  const src = settings && typeof settings === "object" ? settings : {};
  const shortcuts = src.shortcuts && typeof src.shortcuts === "object" ? src.shortcuts : {};
  const clean = {};
  for (const [id, chord] of Object.entries(shortcuts)) {
    if (typeof id === "string" && typeof chord === "string" && CHORD_RE.test(chord)) clean[id] = chord;
  }
  out.shortcuts = clean;
  return out;
}

export function loadSettings() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")));
  } catch {
    return { shortcuts: {} };
  }
}

export function saveSettings(settings) {
  const clean = sanitize(settings);
  fs.writeFile(SETTINGS_FILE, JSON.stringify(clean, null, 2), () => {});
  return clean;
}
