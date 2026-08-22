// Live per-pane sidebar context (cwd / git branch / listening ports), derived
// from the PTY process tree with lsof/git. No shell cooperation needed.

import { execFile } from "node:child_process";

// Always resolve with stdout, even on a non-zero exit. lsof in particular exits
// 1 whenever it emits any warning (e.g. a pid it can't fully stat) yet still
// prints the matching rows we want; discarding stdout on error would drop every
// listening port. Callers tolerate empty output.
function run(cmd, args, timeoutMs = 1500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (_err, stdout) => {
      resolve(String(stdout || ""));
    });
  });
}

// Tool locations vary (lsof is in /usr/sbin, not /usr/bin, on some macOS
// installs); resolve via PATH to avoid brittle hard-coded paths.
const PGREP = "pgrep";
const LSOF = "lsof";

// Direct child pids of a pid (macOS `pgrep -P`).
async function childPids(pid) {
  const out = await run(PGREP, ["-P", String(pid)]);
  return out.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

// All descendant pids (BFS), including the shell and anything it launched.
async function descendantPids(rootPid, cap = 64) {
  const seen = new Set();
  let frontier = [String(rootPid)];
  while (frontier.length && seen.size < cap) {
    const next = [];
    for (const pid of frontier) {
      for (const c of await childPids(pid)) {
        if (!seen.has(c)) { seen.add(c); next.push(c); }
      }
    }
    frontier = next;
  }
  return [...seen];
}

// Working directory of a pid via `lsof -d cwd`.
async function pidCwd(pid) {
  const out = await run(LSOF, ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const line = out.split("\n").find((l) => l.startsWith("n"));
  return line ? line.slice(1).trim() : "";
}

async function gitBranch(cwd) {
  if (!cwd) return "";
  // --show-current works even in a fresh repo with no commits yet (unlike
  // `rev-parse HEAD`, which errors on an unborn branch). Detached HEAD -> "".
  const out = await run("git", ["-C", cwd, "branch", "--show-current"]);
  return out.trim();
}

// TCP ports the pane's process tree is LISTENing on (de-duplicated, sorted).
async function listeningPorts(pids) {
  if (!pids.length) return [];
  const out = await run(LSOF, ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", pids.join(","), "-Fn"]);
  const ports = new Set();
  for (const l of out.split("\n")) {
    if (!l.startsWith("n")) continue;
    const m = l.match(/:(\d+)$/);
    if (m) ports.add(Number(m[1]));
  }
  return [...ports].sort((a, b) => a - b);
}

// The full metadata bundle for one pane, from its bridge (python) pid. The
// interactive shell is the bridge's direct child; use its cwd for the branch,
// and the whole tree for listening ports.
export async function computeMeta(bridgePid) {
  const kids = await childPids(bridgePid);
  const shellPid = kids[0] || bridgePid;
  const cwd = await pidCwd(shellPid);
  const tree = await descendantPids(bridgePid);
  const [branch, ports] = await Promise.all([gitBranch(cwd), listeningPorts(tree)]);
  return { cwd, branch, ports };
}
