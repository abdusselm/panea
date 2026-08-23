

import { execFile } from "node:child_process";

function git(args, cwd, timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], { timeout: timeoutMs, maxBuffer: 16 << 20 }, (err, stdout) => {
      resolve({ code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, out: String(stdout || "") });
    });
  });
}

function parseNumstat(out) {
  const map = new Map();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [a, d] = parts;
    let path = parts.slice(2).join("\t");
    if (path.includes(" => ")) path = renameNewPath(path);
    map.set(path, { add: a === "-" ? null : Number(a), del: d === "-" ? null : Number(d) });
  }
  return map;
}

function renameNewPath(path) {
  const brace = path.match(/^(.*)\{.* => (.*)\}(.*)$/);
  if (brace) return brace[1] + brace[2] + brace[3];
  return path.split(" => ").pop();
}

function parseStatus(out) {
  const tokens = out.split("\0");
  const rows = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    const x = t[0];
    const y = t[1];
    const path = t.slice(3);
    if (x === "R" || x === "C") i++;
    let kind;
    if (x === "?" && y === "?") kind = "untracked";
    else if (y !== " ") kind = "worktree";
    else kind = "staged";
    rows.push({ path, x, y, kind });
  }
  return rows;
}

export async function gitStatus(cwd) {
  if (!cwd) return { repo: false };
  const statusRes = await git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd);
  if (statusRes.code !== 0) return { repo: false };

  const [branchRes, unstagedRes, stagedRes] = await Promise.all([
    git(["branch", "--show-current"], cwd),
    git(["diff", "--numstat"], cwd),
    git(["diff", "--cached", "--numstat"], cwd),
  ]);

  const unstaged = parseNumstat(unstagedRes.out);
  const staged = parseNumstat(stagedRes.out);
  const files = parseStatus(statusRes.out).map((r) => {
    const n = (r.kind === "staged" ? staged : unstaged).get(r.path);
    return {
      path: r.path,
      kind: r.kind,
      x: r.x,
      y: r.y,
      add: n ? n.add : null,
      del: n ? n.del : null,
    };
  });

  return { repo: true, branch: branchRes.out.trim(), files };
}

export async function gitDiff(cwd, path, mode) {
  if (!cwd || !path) return { patch: "" };
  let res;
  if (mode === "untracked") res = await git(["diff", "--no-index", "--", "/dev/null", path], cwd);
  else if (mode === "staged") res = await git(["diff", "--cached", "--", path], cwd);
  else res = await git(["diff", "--", path], cwd);
  return { patch: res.out };
}
