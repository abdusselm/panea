import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { resolveTreeRoot, realOrEmpty } from "./fs-tree.js";

export const MAX_FILES = 50000;
const MAX_DIRS = 5000;
const SKIP_DIRS = new Set([".git", "node_modules", ".DS_Store"]);

function gitLines(root, args) {
  return new Promise((resolve) => {
    execFile("git", ["-C", root, ...args], { timeout: 10000, maxBuffer: 64 << 20 }, (err, stdout) => {
      resolve(err ? null : String(stdout || "").split("\0").filter(Boolean));
    });
  });
}

async function listRepo(root, max) {
  const [all, deleted] = await Promise.all([
    gitLines(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]),
    gitLines(root, ["ls-files", "-z", "--deleted"]),
  ]);
  if (!all) return null;
  const gone = new Set(deleted || []);
  const files = [...new Set(all)].filter((f) => !gone.has(f));
  return { files: files.slice(0, max), truncated: files.length > max };
}

async function walk(root, max) {
  const files = [];
  const queue = [""];
  let dirs = 0;
  while (queue.length && files.length < max && dirs < MAX_DIRS) {
    const rel = queue.shift();
    dirs++;
    let entries;
    try {
      entries = await readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const child = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) queue.push(child);
      else if (e.isFile() || e.isSymbolicLink()) files.push(child);
      if (files.length >= max) break;
    }
  }
  return { files, truncated: files.length >= max || queue.length > 0 };
}

export async function listProjectFiles({ cwd, root } = {}, { max = MAX_FILES } = {}) {
  let realRoot = "";
  let repo = false;
  if (root) {
    realRoot = await realOrEmpty(root);
    repo = !!realRoot && (await gitLines(realRoot, ["rev-parse", "--show-toplevel"])) !== null;
  } else {
    ({ root: realRoot, repo } = await resolveTreeRoot(cwd));
  }
  if (!realRoot) return { error: "no project" };
  const listed = (repo && (await listRepo(realRoot, max))) || (await walk(realRoot, max));
  return { root: realRoot, repo, ...listed };
}
