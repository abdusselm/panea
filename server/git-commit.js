

import { runGit, rootPathspec } from "./git.js";

function safePaths(paths) {
  if (!Array.isArray(paths)) return [];
  return paths
    .map((p) => String(p || ""))
    .filter((p) => p && !p.startsWith("/") && !p.split("/").includes(".."))
    .map(rootPathspec);
}

function fail(res, fallback) {
  const text = (res.err || res.out || "").trim();
  return { ok: false, error: text || fallback };
}

async function hasHead(cwd) {
  const res = await runGit(["rev-parse", "--verify", "--quiet", "HEAD"], cwd);
  return res.code === 0 && !!res.out.trim();
}

export async function gitStage(cwd, paths) {
  if (!cwd) return { ok: false, error: "no working directory" };
  const files = safePaths(paths);
  if (!files.length) return { ok: false, error: "no files to stage" };
  const res = await runGit(["add", "--", ...files], cwd);
  return res.code === 0 ? { ok: true } : fail(res, "git add failed");
}

export async function gitUnstage(cwd, paths) {
  if (!cwd) return { ok: false, error: "no working directory" };
  const files = safePaths(paths);
  if (!files.length) return { ok: false, error: "no files to unstage" };
  const res = (await hasHead(cwd))
    ? await runGit(["reset", "-q", "HEAD", "--", ...files], cwd)
    : await runGit(["rm", "--cached", "-q", "--", ...files], cwd);
  return res.code === 0 ? { ok: true } : fail(res, "git reset failed");
}

export async function gitStageAll(cwd) {
  if (!cwd) return { ok: false, error: "no working directory" };
  const res = await runGit(["add", "-A"], cwd);
  return res.code === 0 ? { ok: true } : fail(res, "git add failed");
}

export async function gitLastCommitMessage(cwd) {
  if (!cwd || !(await hasHead(cwd))) return { message: "" };
  const res = await runGit(["log", "-1", "--pretty=%B"], cwd);
  return { message: res.code === 0 ? res.out.replace(/\n+$/, "") : "" };
}

export async function gitCommit(cwd, options = {}) {
  if (!cwd) return { ok: false, error: "no working directory" };
  const message = String(options.message || "").trim();
  if (!message) return { ok: false, error: "commit message is empty" };
  const amend = !!options.amend;

  if (options.stageAll) {
    const staged = await gitStageAll(cwd);
    if (!staged.ok) return staged;
  }

  if (!amend) {
    const staged = await runGit(["diff", "--cached", "--name-only"], cwd);
    if (!staged.out.trim()) return { ok: false, error: "nothing staged — stage a file first" };
  }

  const args = ["commit", "-m", message];
  if (amend) args.push("--amend");
  const res = await runGit(args, cwd, 20000);
  if (res.code !== 0) return fail(res, "git commit failed");

  const head = await runGit(["log", "-1", "--pretty=%h %s"], cwd);
  return { ok: true, head: head.out.trim() };
}
