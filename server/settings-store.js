import fs from "node:fs";
import { SETTINGS_FILE } from "./paths.js";

const CHORD_RE = /^Cmd(-Shift)?(-Alt)?(-Ctrl)?-[A-Z]$/;
const TIP_ID_RE = /^[a-z0-9-]{1,40}$/;
const TIP_IDS_MAX = 100;
const TIP_SHOWN_MAX = 99;

function sanitizeShortcuts(shortcuts) {
  const src = shortcuts && typeof shortcuts === "object" ? shortcuts : {};
  const clean = {};
  for (const [id, chord] of Object.entries(src)) {
    if (typeof id === "string" && typeof chord === "string" && CHORD_RE.test(chord)) clean[id] = chord;
  }
  return clean;
}

function sanitizeTips(tips) {
  const src = tips && typeof tips === "object" ? tips : {};
  const retiredSrc = Array.isArray(src.retired) ? src.retired : [];
  const retired = [...new Set(retiredSrc.filter((id) => typeof id === "string" && TIP_ID_RE.test(id)))].slice(0, TIP_IDS_MAX);
  const shownSrc = src.shown && typeof src.shown === "object" ? src.shown : {};
  const shown = {};
  for (const [id, count] of Object.entries(shownSrc).slice(0, TIP_IDS_MAX)) {
    if (TIP_ID_RE.test(id) && Number.isInteger(count) && count > 0) shown[id] = Math.min(count, TIP_SHOWN_MAX);
  }
  return { enabled: src.enabled !== false, retired, shown };
}

function sanitize(settings) {
  const src = settings && typeof settings === "object" ? settings : {};
  return { shortcuts: sanitizeShortcuts(src.shortcuts), tips: sanitizeTips(src.tips) };
}

export function loadSettings() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")));
  } catch {
    return sanitize({});
  }
}

export function saveSettings(patch) {
  const src = patch && typeof patch === "object" ? patch : {};
  const clean = sanitize({ ...loadSettings(), ...src });
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(clean, null, 2)); } catch {}
  return clean;
}
