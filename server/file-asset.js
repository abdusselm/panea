import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isInside, realOrEmpty } from "./fs-tree.js";

export const MAX_ASSET_BYTES = 8 << 20;

const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

export async function readFileAsset({ root, path: p } = {}) {
  if (!root || !p) return { error: "no path" };
  const realRoot = await realOrEmpty(root);
  if (!realRoot) return { error: "no project" };
  const mime = IMAGE_MIME[path.extname(String(p)).toLowerCase()];
  if (!mime) return { error: "not an image" };
  const target = await realOrEmpty(path.resolve(realRoot, String(p)));
  if (!target) return { error: "not found" };
  if (!isInside(realRoot, target)) return { error: "outside this project" };
  try {
    const st = await stat(target);
    if (!st.isFile()) return { error: "not a file" };
    if (st.size > MAX_ASSET_BYTES) return { error: "too large" };
    const buf = await readFile(target);
    return { mime, data: buf.toString("base64") };
  } catch {
    return { error: "unreadable" };
  }
}
