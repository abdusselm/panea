

import fs from "node:fs";
import { AGENTS_FILE } from "./paths.js";

const DEFAULTS = [
  { name: "claude", match: ["claude"], resume: "claude --continue" },
  { name: "codex", match: ["codex"], resume: "codex resume" },
  { name: "claude-saka", match: ["claude-saka"], resume: "claude-saka --continue" },
  { name: "codex-saka", match: ["codex-saka"], resume: "codex-saka resume" },
];

function oneLine(s) {
  return String(s).replace(/[\r\n]+/g, " ").trim();
}

function sanitize(list) {
  const src = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const e of src) {
    if (!e || typeof e !== "object") continue;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const resume = typeof e.resume === "string" ? oneLine(e.resume) : "";
    if (!name || !resume || seen.has(name)) continue;
    const match = Array.isArray(e.match)
      ? e.match.filter((m) => typeof m === "string" && m.trim()).map((m) => m.trim())
      : [];
    seen.add(name);
    out.push({ name, match: match.length ? match : [name], resume });
  }
  return out;
}

export function loadAgents() {
  try {
    const parsed = sanitize(JSON.parse(fs.readFileSync(AGENTS_FILE, "utf8")));

    return parsed;
  } catch {
    fs.writeFile(AGENTS_FILE, JSON.stringify(DEFAULTS, null, 2), () => {});
    return DEFAULTS.map((d) => ({ ...d, match: [...d.match] }));
  }
}
