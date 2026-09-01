import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.PANEA_E2E_PORT || 4899);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const STATE_DIR = path.join(os.tmpdir(), "panea-e2e-state");
export const SESSION_FILE = path.join(STATE_DIR, "session.json");
