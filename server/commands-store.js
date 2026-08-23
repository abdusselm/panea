

import fs from "node:fs";
import { COMMANDS_FILE } from "./paths.js";

export function loadCommands() {
  try {
    const c = JSON.parse(fs.readFileSync(COMMANDS_FILE, "utf8"));
    if (Array.isArray(c)) return c;
    if (c && Array.isArray(c.commands)) return c.commands;
    return [];
  } catch {
    return [];
  }
}
