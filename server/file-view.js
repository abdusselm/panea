import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { resolveTreeRoot, isInside, realOrEmpty } from "./fs-tree.js";
import { gitLineMarks } from "./git.js";

export const MAX_VIEW_BYTES = 1 << 20;
export const MAX_HIGHLIGHT_BYTES = 300 * 1024;
const SNIFF_BYTES = 8192;

export function resolveViewPath(p, base) {
  const raw = String(p || "");
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return path.join(homedir(), raw.slice(2));
  return path.resolve(base || "/", raw);
}

async function projectRoot(cwd, root) {
  if (root) return realOrEmpty(root);
  return (await resolveTreeRoot(cwd)).root;
}

export async function readFileView({ cwd, root, path: p } = {}) {
  if (!p) return { error: "no path" };
  const realRoot = await projectRoot(cwd, root);
  if (!realRoot) return { error: "no project" };
  const target = await realOrEmpty(resolveViewPath(p, root ? realRoot : cwd || realRoot));
  if (!target) return { root: realRoot, error: "not found" };
  if (!isInside(realRoot, target)) return { root: realRoot, error: "outside this project" };
  const rel = path.relative(realRoot, target).split(path.sep).join("/");
  const base = { root: realRoot, rel };
  let st;
  try {
    st = await stat(target);
  } catch {
    return { ...base, error: "not found" };
  }
  if (!st.isFile()) return { ...base, error: "not a file" };
  if (st.size > MAX_VIEW_BYTES) return { ...base, size: st.size, tooLarge: true };
  let buf;
  try {
    buf = await readFile(target);
  } catch {
    return { ...base, error: "unreadable" };
  }
  if (buf.length > MAX_VIEW_BYTES) return { ...base, size: buf.length, tooLarge: true };
  if (buf.subarray(0, SNIFF_BYTES).includes(0)) return { ...base, size: buf.length, binary: true };
  return {
    ...base,
    size: buf.length,
    mtimeMs: st.mtimeMs,
    plain: buf.length > MAX_HIGHLIGHT_BYTES,
    content: buf.toString("utf8"),
  };
}

export async function loadFileView(req) {
  const view = await readFileView(req);
  if (view.content === undefined) return view;
  return { ...view, ...(await gitLineMarks(view.root, view.rel)) };
}
