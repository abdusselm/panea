

import { runtime } from "./state.js";
import { persist } from "./session.js";

const MIN_W = 160;
const MAX_W = 520;

export function clampSidebarWidth(w) {
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(w)));
}

export function applySidebarWidth(w) {
  runtime.sidebarWidth = clampSidebarWidth(w);
  document.documentElement.style.setProperty("--sidebar-w", runtime.sidebarWidth + "px");
}

export function initSidebarResize() {
  const resizer = document.getElementById("sidebar-resizer");
  if (!resizer) return;
  applySidebarWidth(runtime.sidebarWidth);
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizer.classList.add("dragging");
    document.body.classList.add("resizing-sidebar");
    document.body.style.cursor = "col-resize";

    const onMove = (ev) => applySidebarWidth(ev.clientX);
    const onUp = () => {
      resizer.classList.remove("dragging");
      document.body.classList.remove("resizing-sidebar");
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      persist();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}
