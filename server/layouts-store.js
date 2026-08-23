// Named workspace layouts, persisted to ~/.panea/layouts.json as
// { "<name>": { tabs: [ { name, cwd, tree, customName }, ... ] } }.

import fs from "node:fs";
import { LAYOUTS_FILE } from "./paths.js";

export function loadLayouts() {
  try {
    const v = JSON.parse(fs.readFileSync(LAYOUTS_FILE, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function write(map) {
  fs.writeFile(LAYOUTS_FILE, JSON.stringify(map, null, 2), () => {});
}

export function saveLayout(name, layout) {
  const clean = String(name || "").trim();
  if (!clean || !layout) return loadLayouts();
  const map = loadLayouts();
  map[clean] = layout;
  write(map);
  return map;
}

export function deleteLayout(name) {
  const map = loadLayouts();
  if (name in map) { delete map[name]; write(map); }
  return map;
}
