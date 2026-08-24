const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

const teardowns = new Set();
let installed = false;

export function runShutdown() {
  for (const teardown of [...teardowns]) {
    teardowns.delete(teardown);
    try {
      teardown();
    } catch {}
  }
}

function install() {
  if (installed) return;
  installed = true;
  process.on("exit", runShutdown);
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      runShutdown();
      process.exit(0);
    });
  }
}

export function onShutdown(teardown) {
  install();
  teardowns.add(teardown);
  return () => teardowns.delete(teardown);
}

export function pendingCount() {
  return teardowns.size;
}
