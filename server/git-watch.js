

import { watch } from "node:fs";
import { runGit } from "./git.js";

const DEBOUNCE_MS = 400;

const watchers = new Map();

const GIT_META = new Set(["index", "HEAD", "MERGE_HEAD", "MERGE_MSG", "ORIG_HEAD", "refs"]);

export function isRelevantChange(rel) {
  if (!rel) return true;
  const parts = String(rel).split("/");
  if (parts.includes("node_modules")) return false;
  if (parts[parts.length - 1] === ".DS_Store") return false;
  const i = parts.indexOf(".git");
  if (i === -1) return true;
  return GIT_META.has(parts[i + 1] || "");
}

function release(root, listener) {
  const entry = watchers.get(root);
  if (!entry) return;
  entry.listeners.delete(listener);
  if (entry.listeners.size) return;
  clearTimeout(entry.timer);
  try { entry.watcher.close(); } catch {}
  watchers.delete(root);
}

function acquire(root, listener) {
  let entry = watchers.get(root);
  if (!entry) {
    entry = { listeners: new Set(), timer: null, watcher: null };
    let watcher;
    try {
      watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
        if (!isRelevantChange(filename)) return;
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          entry.timer = null;
          for (const fn of entry.listeners) fn();
        }, DEBOUNCE_MS);
      });
    } catch {
      return false;
    }
    watcher.on("error", () => {
      for (const fn of [...entry.listeners]) release(root, fn);
    });
    entry.watcher = watcher;
    watchers.set(root, entry);
  }
  entry.listeners.add(listener);
  return true;
}

export function startGitWatch(cwd, onChange) {
  let stopped = false;
  let root = "";
  const listener = () => { if (!stopped) onChange(); };

  if (cwd) {
    runGit(["rev-parse", "--show-toplevel"], cwd).then((res) => {
      const top = res.code === 0 ? res.out.trim() : "";
      if (stopped || !top) return;
      if (acquire(top, listener)) root = top;
    }, () => {});
  }

  return () => {
    if (stopped) return;
    stopped = true;
    if (root) release(root, listener);
  };
}
