// Live per-pane sidebar context (cwd / git branch / listening ports), derived
// from the process tree with ps/lsof/git. No shell cooperation needed.
//
// Resource discipline: metadata for ALL panes is computed from a single
// snapshot per poll cycle — one `ps`, one `lsof` for cwd, one `lsof` for ports,
// plus git only for cwds not already cached. This keeps process spawns at ~3
// per cycle no matter how many panes/splits are open, instead of the O(panes ×
// descendants) storm a per-pane approach would create.

import { execFile } from "node:child_process";

// Always resolve with stdout, even on a non-zero exit. lsof in particular exits
// 1 whenever it emits any warning (e.g. a pid it can't fully stat) yet still
// prints the matching rows we want; discarding stdout on error would drop every
// listening port. Callers tolerate empty output.
function run(cmd, args, timeoutMs = 2000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 << 20 }, (_err, stdout) => {
      resolve(String(stdout || ""));
    });
  });
}

// lsof lives in /usr/sbin on some macOS installs; resolve via PATH.
const LSOF = "lsof";

// One `ps` snapshot -> children map (ppid -> [pid]). Single spawn for the whole
// process tree of every pane.
async function processChildren() {
  const out = await run("ps", ["-Ao", "pid=,ppid="]);
  const children = new Map();
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    const [, pid, ppid] = m;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  return children;
}

// All descendant pids of a root, walked in-memory from the snapshot (no spawns).
function descendants(children, root, cap = 128) {
  const seen = new Set();
  const stack = [String(root)];
  while (stack.length && seen.size < cap) {
    const p = stack.pop();
    for (const c of children.get(p) || []) {
      if (!seen.has(c)) { seen.add(c); stack.push(c); }
    }
  }
  return [...seen];
}

// Parse an `lsof -Fpn` stream (process sets: `p<pid>` then `n<name>` lines) into
// pid -> handler(name). One spawn covers every pid passed.
async function lsofByPid(args, pids, onName) {
  if (!pids.length) return;
  const out = await run(LSOF, [...args, "-a", "-p", pids.join(",")]);
  let cur = null;
  for (const l of out.split("\n")) {
    if (l[0] === "p") cur = l.slice(1);
    else if (l[0] === "n" && cur) onName(cur, l.slice(1));
  }
}

async function cwdByPid(pids) {
  const map = new Map();
  await lsofByPid(["-d", "cwd", "-Fpn"], pids, (pid, name) => map.set(pid, name.trim()));
  return map;
}

async function portsByPid(pids) {
  const map = new Map();
  await lsofByPid(["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], pids, (pid, name) => {
    const m = name.match(/:(\d+)$/);
    if (!m) return;
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid).add(Number(m[1]));
  });
  return map;
}

// git branch is the one unavoidable per-cwd spawn; cache it briefly so a stable
// checkout doesn't re-run git every cycle. Detached HEAD / non-repo -> "".
const branchCache = new Map(); // cwd -> { branch, at }
const BRANCH_TTL_MS = 8000;
async function gitBranch(cwd) {
  if (!cwd) return "";
  const now = Date.now();
  const hit = branchCache.get(cwd);
  if (hit && now - hit.at < BRANCH_TTL_MS) return hit.branch;
  // --show-current works even in a fresh repo with no commits (unlike
  // `rev-parse HEAD`, which errors on an unborn branch).
  const branch = (await run("git", ["-C", cwd, "branch", "--show-current"])).trim();
  branchCache.set(cwd, { branch, at: now });
  return branch;
}

// Prune stale branch-cache entries so it can't grow unbounded across a long
// session of transient cwds.
function pruneBranchCache() {
  const now = Date.now();
  for (const [cwd, v] of branchCache) if (now - v.at > BRANCH_TTL_MS * 4) branchCache.delete(cwd);
}

// Compute metadata for many panes from one shared snapshot. Returns
// bridgePid -> { cwd, branch, ports }. The interactive shell is each bridge's
// first child; use its cwd for the branch and the whole tree for ports.
export async function computeMetaBatch(bridgePids) {
  const result = new Map();
  if (!bridgePids.length) return result;

  const children = await processChildren();
  const shellOf = new Map();
  const treeOf = new Map();
  const treePids = new Set();
  for (const bp of bridgePids) {
    const kids = children.get(String(bp)) || [];
    shellOf.set(bp, kids[0] || String(bp));
    const tree = descendants(children, bp);
    treeOf.set(bp, tree);
    for (const p of tree) treePids.add(p);
    treePids.add(String(bp));
  }

  const shellPids = [...new Set(shellOf.values())];
  const [cwds, ports] = await Promise.all([cwdByPid(shellPids), portsByPid([...treePids])]);

  for (const bp of bridgePids) {
    const cwd = cwds.get(shellOf.get(bp)) || "";
    const branch = await gitBranch(cwd);
    const portSet = new Set();
    for (const p of treeOf.get(bp)) { const s = ports.get(p); if (s) for (const x of s) portSet.add(x); }
    result.set(bp, { cwd, branch, ports: [...portSet].sort((a, b) => a - b) });
  }
  pruneBranchCache();
  return result;
}
