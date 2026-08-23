

import { enc, u8ToB64 } from "./util.js";
import { wsSend } from "./ws.js";
import { focusPane } from "./panes.js";
import { persist } from "./session.js";

let registry = new Map();

export function setAgents(list) {
  registry = new Map();
  for (const a of Array.isArray(list) ? list : []) {
    if (a && typeof a.name === "string" && typeof a.resume === "string") registry.set(a.name, a.resume);
  }
}

export function resumeCommandFor(name) {
  return registry.get(name) || "";
}

function sendInput(paneId, text) {
  wsSend({ type: "input", paneId, data: u8ToB64(enc.encode(text)) });
}

export function mountResumeBar(pane, agentName) {
  if (!pane || !pane.el) return;
  const old = pane.el.querySelector(".resume-bar");
  if (old) old.remove();

  const bar = document.createElement("div");
  bar.className = "resume-bar";
  const label = document.createElement("span");
  label.className = "rb-label";

  label.append("Resume ", strong(agentName), " session");
  const resumeBtn = document.createElement("button");
  resumeBtn.className = "rb-go";
  resumeBtn.textContent = "Resume ▸";
  const dismiss = document.createElement("button");
  dismiss.className = "rb-x";
  dismiss.title = "Dismiss";
  dismiss.textContent = "✕";
  bar.append(label, resumeBtn, dismiss);

  resumeBtn.onclick = () => {
    const cmd = resumeCommandFor(agentName);
    if (!cmd) return;
    focusPane(pane.id);
    sendInput(pane.id, cmd + "\r");
    pane.restoreAgent = "";
    bar.remove();
    persist();
  };
  dismiss.onclick = () => {
    pane.restoreAgent = "";
    bar.remove();
    persist();
  };

  const term = pane.el.querySelector(".leaf-term");
  if (term) pane.el.insertBefore(bar, term);
  else pane.el.appendChild(bar);
}

function strong(text) {
  const s = document.createElement("strong");
  s.textContent = text;
  return s;
}
