

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 1 << 20;

export async function readCwdFile(cwd, relPath) {
  if (!cwd || !relPath) return { ok: false, error: "no path" };
  if (!/\.md$/i.test(relPath)) return { ok: false, error: "not a markdown file" };
  const base = path.resolve(cwd);
  const resolved = path.resolve(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    return { ok: false, error: "outside working directory" };
  }
  try {
    const st = await stat(resolved);
    if (!st.isFile()) return { ok: false, error: "not a file" };
    if (st.size > MAX_BYTES) return { ok: false, error: "file too large" };
    const content = await readFile(resolved, "utf8");
    return { ok: true, content };
  } catch (_) {
    return { ok: false, error: "not found" };
  }
}
