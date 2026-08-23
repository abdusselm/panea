

import fs from "node:fs";
import { SESSION_FILE } from "./paths.js";

export function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}

let saveTimer = null;
export function saveSession(layout) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(SESSION_FILE, JSON.stringify(layout, null, 2), () => {});
  }, 150);
}
