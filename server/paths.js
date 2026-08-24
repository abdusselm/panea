

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const PORT = Number(process.env.PANEA_PORT || 4820);
export const HOST = "127.0.0.1";

export const PUBLIC_DIR = path.join(ROOT, "public");
export const NODE_MODULES = path.join(ROOT, "node_modules");
export const BRIDGE = path.join(ROOT, "pty_bridge.py");
export const ZSH_THEME_DIR = path.join(ROOT, "shell", "zsh");

export const STATE_DIR = process.env.PANEA_STATE_DIR
  ? path.resolve(process.env.PANEA_STATE_DIR)
  : path.join(os.homedir(), ".panea");
export const SESSION_FILE = path.join(STATE_DIR, "session.json");
export const COMMANDS_FILE = path.join(STATE_DIR, "commands.json");
export const LAYOUTS_FILE = path.join(STATE_DIR, "layouts.json");
export const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");
export const AGENTS_FILE = path.join(STATE_DIR, "agents.json");

export const PY =
  process.env.PANEA_PYTHON || (fs.existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3");

fs.mkdirSync(STATE_DIR, { recursive: true });
