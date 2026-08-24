

const PING_MS = 25000;

export function keepAlive(ws) {
  let alive = true;
  const onPong = () => { alive = true; };
  ws.on("pong", onPong);

  const timer = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    try { ws.ping(); } catch {}
  }, PING_MS);
  if (timer.unref) timer.unref();

  return () => {
    clearInterval(timer);
    ws.off("pong", onPong);
  };
}
