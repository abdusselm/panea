

import { openMdPreview } from "./md-preview.js";
import { findMdLinks } from "./md-links.js";

const providers = new Map();

function linksForLine(pane, bufferLineNumber) {
  const line = pane.term.buffer.active.getLine(bufferLineNumber - 1);
  if (!line) return undefined;
  const text = line.translateToString(true);
  const found = findMdLinks(text);
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
