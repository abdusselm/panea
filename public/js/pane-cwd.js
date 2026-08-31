

const REPLY_TIMEOUT_MS = 400;

const pending = new Map();

function settle(paneId, cwd) {
  const entry = pending.get(paneId);
  if (!entry) return;
  pending.delete(paneId);
  clearTimeout(entry.timer);
  entry.resolve(cwd || entry.fallback || "");
}

export function requestPaneCwd(paneId, fallback, send) {
  if (!paneId || typeof send !== "function") return Promise.resolve(fallback || "");
  settle(paneId, "");
  return new Promise((resolve) => {
    const entry = { resolve, fallback: fallback || "", timer: 0 };
    entry.timer = setTimeout(() => settle(paneId, ""), REPLY_TIMEOUT_MS);
    pending.set(paneId, entry);
    send({ type: "getPaneCwd", paneId });
  });
}

export function deliverPaneCwd(paneId, cwd) {
  settle(paneId, cwd);
}

export function forgetPaneCwd(paneId) {
  settle(paneId, "");
}
