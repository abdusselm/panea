

import { wsSend } from "./ws.js";
import { escapeHtml } from "./buffer-html.js";
import { mdToHtml } from "./markdown.js";

let panelEl = null, titleEl = null, bodyEl = null;
let curCwd = "", curPath = "";

function ensureDom() {
  if (panelEl) return;
  panelEl = document.createElement("div");
  panelEl.id = "md-preview-panel";
  panelEl.innerHTML =
    '<div class="md-box">' +
    '<div class="md-head"><span class="md-title"></span>' +
    '<span class="md-actions"><button class="md-close">Close</button></span></div>' +
    '<div class="md-body"></div>' +
    "</div>";
  document.body.appendChild(panelEl);
  titleEl = panelEl.querySelector(".md-title");
  bodyEl = panelEl.querySelector(".md-body");
  panelEl.addEventListener("mousedown", (e) => { if (e.target === panelEl) close(); });
  panelEl.querySelector(".md-close").onclick = () => close();
  panelEl.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } });
  panelEl.tabIndex = -1;
}

export function openMdPreview(path, cwd) {
  if (!path) return;
  ensureDom();
  curCwd = cwd || "";
  curPath = path;
  titleEl.textContent = path;
  bodyEl.innerHTML = '<div class="md-empty">Loading…</div>';
  panelEl.classList.add("open");
  panelEl.focus();
  wsSend({ type: "getFileContent", cwd: curCwd, path });
}

export function setMdContent(msg) {
  if (!panelEl || msg.path !== curPath || msg.cwd !== curCwd) return;
  if (!msg.ok) {
    bodyEl.innerHTML = '<div class="md-empty">' + escapeHtml(msg.error || "Could not load file") + "</div>";
    return;
  }
  bodyEl.innerHTML = mdToHtml(msg.content || "");
  bodyEl.scrollTop = 0;
}

export function isMdPreviewOpen() { return !!(panelEl && panelEl.classList.contains("open")); }

function close() { if (panelEl) panelEl.classList.remove("open"); }
export function closeMdPreview() { close(); }
