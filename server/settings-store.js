// App settings, persisted to ~/.panea/settings.json. Currently holds keyboard
// shortcut overrides: { shortcuts: { "<action-id>": "Cmd-Shift-T", ... } }.
// Only actions the user has changed appear; defaults live in the frontend
// (public/js/shortcuts.js), so the file stays a sparse diff, not a full dump.

import fs from "node:fs";
import { SETTINGS_FILE } from "./paths.js";

// Accept only Cmd-based letter chords (optionally with Shift/Alt/Ctrl), so a
// tampered file can never bind a bare printable key that would hijack typing.
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
