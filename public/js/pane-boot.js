

const TICK_MS = 1000;
const SLOW_AFTER_S = 6;
const ESC = 0x1b;

const boots = new Map();
let ticker = 0;

function label(secs) {
  if (secs < SLOW_AFTER_S) return `starting shell… ${secs}s`;
  return `starting shell… ${secs}s · slow shell config`;
}

function paint(entry) {
  const secs = Math.floor((Date.now() - entry.startedAt) / 1000);
  entry.el.classList.add("open");
  entry.el.classList.toggle("slow", secs >= SLOW_AFTER_S);
  entry.labelEl.textContent = label(secs);
}

function anyBooting() {
  for (const entry of boots.values()) if (entry.booting) return true;
  return false;
}

function stopTicker() {
  if (!ticker) return;
  clearInterval(ticker);
  ticker = 0;
}

function tick() {
  for (const entry of boots.values()) if (entry.booting) paint(entry);
  if (!anyBooting()) stopTicker();
}

function startTicker() {
  if (ticker) return;
  ticker = setInterval(tick, TICK_MS);
}

function hasEscape(bytes) {
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === ESC) return true;
  return false;
}

function settle(entry) {
  entry.booting = false;
  entry.el.classList.remove("open", "slow");
  if (!anyBooting()) stopTicker();
}

export function markPaneBooting(paneId) {
  const entry = boots.get(paneId);
  if (!entry) return;
  entry.booting = true;
  entry.typed = false;
  entry.startedAt = Date.now();
  entry.el.classList.remove("open", "slow");
  startTicker();
}

export function noteBootInput(paneId) {
  const entry = boots.get(paneId);
  if (entry && entry.booting) entry.typed = true;
}

export function markPaneReady(paneId, bytes) {
  const entry = boots.get(paneId);
  if (!entry || !entry.booting) return;
  if (bytes && entry.typed && !hasEscape(bytes)) return;
  settle(entry);
}

export function wirePaneBoot(pane) {
  const el = document.createElement("div");
  el.className = "pane-boot";
  const spinner = document.createElement("span");
  spinner.className = "pane-boot-spinner";
  const labelEl = document.createElement("span");
  labelEl.className = "pane-boot-label";
  el.append(spinner, labelEl);
  pane.el.appendChild(el);
  boots.set(pane.id, { paneId: pane.id, el, labelEl, booting: false, typed: false, startedAt: 0 });
}

export function closePaneBootFor(paneId) {
  const entry = boots.get(paneId);
  if (!entry) return;
  if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
  boots.delete(paneId);
  if (!anyBooting()) stopTicker();
}
