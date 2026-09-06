

import { openMdPreview } from "./md-preview.js";
import { findMdLinksAcrossRows } from "./md-links.js";

const providers = new Map();

function collectWrappedRows(buffer, row) {
  let start = row;
  while (start > 0) {
    const l = buffer.getLine(start);
    if (!l || !l.isWrapped) break;
    start--;
  }
  const rows = [];
  let r = start;
  for (;;) {
    const l = buffer.getLine(r);
    if (!l) break;
    rows.push({ row: r, text: l.translateToString(true) });
    const next = buffer.getLine(r + 1);
    if (next && next.isWrapped) { r++; continue; }
    break;
  }
  return rows;
}

export function linksForLine(pane, bufferLineNumber) {
  const buffer = pane.term.buffer.active;
  const row = bufferLineNumber - 1;
  const rows = collectWrappedRows(buffer, row);
  if (!rows.length) return undefined;

  const curIdx = row - rows[0].row;
  const found = findMdLinksAcrossRows(rows.map((r) => r.text), curIdx);
  if (!found.length) return undefined;

  return found.map((f) => ({
    text: f.text,
    range: {
      start: { x: f.startCol, y: bufferLineNumber },
      end: { x: f.endCol, y: bufferLineNumber },
    },
    activate: () => openMdPreview(f.text, (pane.meta && pane.meta.cwd) || pane.cwd),
  }));
}

export function wireMdLinks(pane) {
  const disposable = pane.term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) { callback(linksForLine(pane, bufferLineNumber)); },
  });
  providers.set(pane.id, disposable);
}

export function closeMdLinksFor(paneId) {
  const d = providers.get(paneId);
  if (!d) return;
  try { d.dispose(); } catch (_) {}
  providers.delete(paneId);
}
