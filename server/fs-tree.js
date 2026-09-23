import { execFile } from "node:child_process";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { runGit } from "./git.js";

export const MAX_ENTRIES = 2000;

const HIDDEN = new Set([".git", ".DS_Store"]);

export function isInside(root, abs) {
  return abs === root || abs.startsWith(root + path.sep);
}

export async function realOrEmpty(p) {
  try { return await realpath(p); } catch { return ""; }
}

const byName = (a, b) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || (a.name < b.name ? -1 : 1);

function isDirType(type) {
  return type === "dir" || type === "link-dir";
}

export function sortEntries(entries) {
  return entries.sort((a, b) => (isDirType(b.type) - isDirType(a.type)) || byName(a, b));
}

export async function resolveTreeRoot(cwd) {
  const base = cwd ? await realOrEmpty(cwd) : "";
  if (!base) return { root: "", repo: false };
  const res = await runGit(["rev-parse", "--show-toplevel"], base);
  const top = res.code === 0 ? await realOrEmpty(res.out.trim()) : "";
  return top ? { root: top, repo: true } : { root: base, repo: false };
}

function checkIgnore(root, rels) {
  if (!rels.length) return Promise.resolve(new Set());
  return new Promise((resolve) => {
    const child = execFile(
      "git", ["-C", root, "check-ignore", "-z", "--stdin"],
      { timeout: 5000, maxBuffer: 16 << 20 },
      (err, stdout) => {
        if (err && err.code !== 1) return resolve(null);
        resolve(new Set(String(stdout || "").split("\0").filter(Boolean)));
      }
    );
    child.stdin.on("error", () => {});
    child.stdin.end(rels.join("\0") + "\0");
  });
}

async function describe(root, dirAbs, dirent) {
  if (!dirent.isSymbolicLink()) return { name: dirent.name, type: dirent.isDirectory() ? "dir" : "file" };
  const abs = path.join(dirAbs, dirent.name);
  try {
    if (!(await stat(abs)).isDirectory()) return { name: dirent.name, type: "link-file" };
  } catch {
    return { name: dirent.name, type: "link-file" };
  }
  const entry = { name: dirent.name, type: "link-dir" };
  if (!isInside(root, await realOrEmpty(abs))) entry.outside = true;
  return entry;
}

async function listOne(root, rel) {
  const abs = path.resolve(root, rel || ".");
  const target = await realOrEmpty(abs);
  if (!target) return { error: "not found" };
  if (!isInside(root, target)) return { error: "outside" };
  let dirents;
  try {
    dirents = await readdir(target, { withFileTypes: true });
  } catch {
    return { error: "not a directory" };
  }
  const all = await Promise.all(dirents.filter((d) => !HIDDEN.has(d.name)).map((d) => describe(root, abs, d)));
  sortEntries(all);
  const entries = all.slice(0, MAX_ENTRIES);
  return { entries, truncated: all.length - entries.length };
}

const childRel = (rel, name) => (rel ? rel + "/" + name : name);

async function markIgnored(root, dirs) {
  const listed = Object.entries(dirs).filter(([, d]) => d.entries);
  const rels = listed.flatMap(([rel, d]) => d.entries.map((e) => childRel(rel, e.name)));
  let ignored = await checkIgnore(root, rels);
  if (!ignored) {
    const perDir = await Promise.all(listed.map(([rel, d]) => checkIgnore(root, d.entries.map((e) => childRel(rel, e.name)))));
    ignored = new Set(perDir.flatMap((s) => (s ? [...s] : [])));
  }
  for (const [rel, d] of listed) {
    for (const e of d.entries) e.ignored = ignored.has(childRel(rel, e.name));
  }
}

export async function listDirs(root, rels, { repo = true } = {}) {
  const realRoot = root ? await realOrEmpty(root) : "";
  const wanted = [...new Set((Array.isArray(rels) ? rels : []).map((r) => String(r || "")))];
  const dirs = {};
  if (!realRoot) {
    for (const rel of wanted) dirs[rel] = { error: "not found" };
    return dirs;
  }
  const results = await Promise.all(wanted.map((rel) => listOne(realRoot, rel)));
  wanted.forEach((rel, i) => { dirs[rel] = results[i]; });
  if (repo) await markIgnored(realRoot, dirs);
  else for (const d of results) for (const e of d.entries || []) e.ignored = false;
  return dirs;
}

export async function revealPath(root, rel) {
  const realRoot = root ? await realOrEmpty(root) : "";
  if (!realRoot) return { ok: false, error: "no root" };
  const abs = path.resolve(realRoot, rel || ".");
  if (!isInside(realRoot, abs)) return { ok: false, error: "outside" };
  if (abs !== realRoot && !isInside(realRoot, await realOrEmpty(path.dirname(abs)))) return { ok: false, error: "outside" };
  return new Promise((resolve) => {
    execFile("open", ["-R", abs], { timeout: 5000 }, (err) => resolve(err ? { ok: false, error: "open failed" } : { ok: true }));
  });
}
