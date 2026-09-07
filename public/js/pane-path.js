

import { state } from "./state.js";

let homeDir = "";

export function setHomeDir(dir) {
  homeDir = String(dir || "").replace(/\/+$/, "");
  for (const p of state.panes.values()) refreshPanePath(p);
}

const MAX_SEGMENTS = 4;

export function displayPath(cwd) {
  if (!cwd) return "";
  let path = cwd;
  if (homeDir && cwd === homeDir) path = "~";
  else if (homeDir && cwd.startsWith(homeDir + "/")) path = "~" + cwd.slice(homeDir.length);
  const lead = path[0] === "~" ? "~/" : "/";
  const parts = path.split("/").filter((s) => s && s !== "~");
  if (parts.length <= MAX_SEGMENTS) return path;
  return lead + "…/" + parts.slice(-MAX_SEGMENTS).join("/");
}

export function refreshPanePath(p) {
  if (!p || !p.pathEl) return;
  const cwd = (p.meta && p.meta.cwd) || p.cwd || "";
  const shown = displayPath(cwd);
  p.pathEl.textContent = shown ? "- " + shown : "";
  p.pathEl.title = cwd;
  p.pathEl.style.display = shown ? "" : "none";
}

export function wirePanePath(p) {
  p.pathEl = p.el.querySelector(".pane-path");
  refreshPanePath(p);
}
