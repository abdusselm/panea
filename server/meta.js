

import { execFile } from "node:child_process";

function run(cmd, args, timeoutMs = 2000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 << 20 }, (_err, stdout) => {
      resolve(String(stdout || ""));
    });
  });
}

const LSOF = "lsof";

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

const INTERPRETERS = new Set([
  "node", "node.js", "nodejs", "bun", "deno", "python", "python2", "python3",
  "ruby", "perl", "sh", "bash", "zsh", "env",
]);
const SCRIPT_EXT = /\.(js|mjs|cjs|ts|py|rb)$/;

function norm(tok) {
  let b = String(tok || "").split("/").filter(Boolean).pop() || "";
  b = b.toLowerCase();
  if (b[0] === "-") b = b.slice(1);
  return b.replace(SCRIPT_EXT, "");
}

export function programOf(args) {
  const tokens = String(args || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  let prog = norm(tokens[0]);
  let i = 1;
  while (INTERPRETERS.has(prog) && i < tokens.length) {
    while (i < tokens.length && (tokens[i][0] === "-" || tokens[i].includes("="))) i++;
    if (i >= tokens.length) break;
    prog = norm(tokens[i]);
    i++;
  }
  return prog;
}

async function commandsByPid(pids) {
  const map = new Map();
  if (!pids.length) return map;
  const out = await run("ps", ["-o", "pid=,args=", "-p", pids.join(",")]);
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

function detectAgent(treePids, cmds, matchers) {
  if (!matchers.length) return "";
  for (const pid of treePids) {
    const prog = programOf(cmds.get(pid));
    if (!prog) continue;
    for (const m of matchers) if (m.set.has(prog)) return m.name;
  }
  return "";
}

const branchCache = new Map();
const BRANCH_TTL_MS = 8000;
async function gitBranch(cwd) {
  if (!cwd) return "";
  const now = Date.now();
  const hit = branchCache.get(cwd);
  if (hit && now - hit.at < BRANCH_TTL_MS) return hit.branch;

  const branch = (await run("git", ["-C", cwd, "branch", "--show-current"])).trim();
  branchCache.set(cwd, { branch, at: now });
  return branch;
}

function pruneBranchCache() {
  const now = Date.now();
  for (const [cwd, v] of branchCache) if (now - v.at > BRANCH_TTL_MS * 4) branchCache.delete(cwd);
}

export async function cwdOfBridge(bridgePid) {
  if (!bridgePid) return "";
  const children = await processChildren();
  const shell = (children.get(String(bridgePid)) || [])[0] || String(bridgePid);
  const cwds = await cwdByPid([shell]);
  return cwds.get(shell) || "";
}

export async function computeMetaBatch(bridgePids, agents = []) {
  const result = new Map();
  if (!bridgePids.length) return result;

  const matchers = agents.map((a) => ({
    name: a.name,
    set: new Set((a.match || [a.name]).map((s) => String(s).toLowerCase())),
  }));

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

  const [cwds, ports, cmds] = await Promise.all([
    cwdByPid(shellPids),
    portsByPid([...treePids]),
    matchers.length ? commandsByPid([...treePids]) : Promise.resolve(new Map()),
  ]);

  for (const bp of bridgePids) {
    const cwd = cwds.get(shellOf.get(bp)) || "";
    const branch = await gitBranch(cwd);
    const portSet = new Set();
    for (const p of treeOf.get(bp)) { const s = ports.get(p); if (s) for (const x of s) portSet.add(x); }
    const agent = detectAgent(treeOf.get(bp), cmds, matchers);
    result.set(bp, { cwd, branch, ports: [...portSet].sort((a, b) => a - b), agent });
  }
  pruneBranchCache();
  return result;
}
