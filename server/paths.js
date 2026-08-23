// Filesystem locations and runtime constants, resolved once. Everything is
// derived from the project root (the parent of this server/ directory).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const PORT = Number(process.env.PANEA_PORT || 4820);
export const HOST = "127.0.0.1"; // local only, never bind public

export const PUBLIC_DIR = path.join(ROOT, "public");
export const NODE_MODULES = path.join(ROOT, "node_modules");
export const BRIDGE = path.join(ROOT, "pty_bridge.py");
export const ZSH_THEME_DIR = path.join(ROOT, "shell", "zsh");

export const STATE_DIR = path.join(os.homedir(), ".panea");
export const SESSION_FILE = path.join(STATE_DIR, "session.json");
export const COMMANDS_FILE = path.join(STATE_DIR, "commands.json");
export const LAYOUTS_FILE = path.join(STATE_DIR, "layouts.json");

// python3 is Apple-signed and its `pty` module needs no helper binary (unlike
// node-pty, whose unsigned helper is blocked on managed macOS).
export const PY = fs.existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3";

fs.mkdirSync(STATE_DIR, { recursive: true });
