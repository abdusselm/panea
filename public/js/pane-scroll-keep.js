const BOTTOM_EPSILON = 2;

export function scrollSnapshot(viewportY, baseY) {
  return { top: viewportY, atBottom: baseY - viewportY < BOTTOM_EPSILON };
}

export function keptViewport(snap, baseY) {
  if (!snap || snap.atBottom) return baseY;
  return Math.max(0, Math.min(snap.top, baseY));
}

export function captureScroll(term) {
  if (!term || !term.buffer) return null;
  const buf = term.buffer.active;
  return scrollSnapshot(buf.viewportY, buf.baseY);
}

export function restoreScroll(term, snap) {
  if (!term || !snap || !term.buffer) return;
  const baseY = term.buffer.active.baseY;
  const line = keptViewport(snap, baseY);
  if (line >= baseY) term.scrollToBottom();
  else term.scrollToLine(line);
}
