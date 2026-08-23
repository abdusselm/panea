// Git working-tree inspection for the diff panel. Given a pane's cwd, report
// whether it's a repo, the current branch, and the changed-file list (with
// per-file add/delete counts); and, on demand, the unified diff for one file.
//
// Resource discipline: git runs ONLY on demand — when the panel opens or a file
// row is clicked — never on a poll timer. A status call is 3 short git spawns
// (status + two numstats); a diff call is one. Nothing here runs per-pane or in
// a loop. Branch/cwd for the sidebar stays in meta.js on its own cached poll.

import { execFile } from "node:child_process";

// Run git in `cwd`, resolving with { code, out } — never rejecting. git exits
// non-zero for benign cases we still want output from (e.g. `diff --no-index`
// always exits 1 when files differ), so callers branch on `code` themselves.
function git(args, cwd, timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], { timeout: timeoutMs, maxBuffer: 16 << 20 }, (err, stdout) => {
      resolve({ code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, out: String(stdout || "") });
    });
  });
}

// `git diff --numstat` -> Map(path -> { add, del }). Binary files report "-"
// for both, which we surface as null so the UI can label them "binary" rather
// than "+0 −0". Renames print `old => new` (optionally brace-collapsed); we key
// on the resolved new path so it matches the status entry.
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

// "src/{old => new}/f.js" -> "src/new/f.js"; "old.js => new.js" -> "new.js".
function renameNewPath(path) {
  const brace = path.match(/^(.*)\{.* => (.*)\}(.*)$/);
  if (brace) return brace[1] + brace[2] + brace[3];
  return path.split(" => ").pop();
}

// Parse `git status --porcelain=v1 -z` into one row per path. -z is NUL-
// separated and gives raw paths (no quoting/escaping to undo). A rename/copy
// entry is followed by an extra NUL token holding the original path.
function parseStatus(out) {
  const tokens = out.split("\0");
  const rows = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    const x = t[0];
    const y = t[1];
    const path = t.slice(3);
    if (x === "R" || x === "C") i++; // consume the original-path token
    let kind;
    if (x === "?" && y === "?") kind = "untracked";
    else if (y !== " ") kind = "worktree";     // has unstaged changes
    else kind = "staged";                        // index-only change
    rows.push({ path, x, y, kind });
  }
  return rows;
}

// Whole picture for the panel: is it a repo, on what branch, and which files
// changed with their counts. One status + two numstat spawns.
export async function gitStatus(cwd) {
  if (!cwd) return { repo: false };
  const inside = await git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (inside.code !== 0 || inside.out.trim() !== "true") return { repo: false };

  const [branchRes, statusRes, unstagedRes, stagedRes] = await Promise.all([
    git(["branch", "--show-current"], cwd),
    git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd),
    git(["diff", "--numstat"], cwd),
    git(["diff", "--cached", "--numstat"], cwd),
  ]);

  const unstaged = parseNumstat(unstagedRes.out);
  const staged = parseNumstat(stagedRes.out);
  const files = parseStatus(statusRes.out).map((r) => {
    const n = (r.kind === "staged" ? staged : unstaged).get(r.path);
    return {
      path: r.path,
      kind: r.kind,          // "staged" | "worktree" | "untracked"
      x: r.x,
      y: r.y,
      add: n ? n.add : null,
      del: n ? n.del : null,
    };
  });

  return { repo: true, branch: branchRes.out.trim(), files };
}

// The unified diff for one file, in the mode its row implies. Untracked files
// have no tracked counterpart, so diff against /dev/null to render the whole
// file as additions.
export async function gitDiff(cwd, path, mode) {
  if (!cwd || !path) return { patch: "" };
  let res;
  if (mode === "untracked") res = await git(["diff", "--no-index", "--", "/dev/null", path], cwd);
  else if (mode === "staged") res = await git(["diff", "--cached", "--", path], cwd);
  else res = await git(["diff", "--", path], cwd);
  return { patch: res.out };
}
