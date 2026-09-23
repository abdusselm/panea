import { openMdPreview } from "./md-preview.js";
import { openInViewer } from "./file-view.js";
import { findFileLinksAcrossRows, isMarkdownPath } from "./file-links.js";
import { noteFeatureUsed } from "./feature-use.js";

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

function paneCwd(pane) {
  return (pane.meta && pane.meta.cwd) || pane.cwd;
}

export function linksForLine(pane, bufferLineNumber) {
  const buffer = pane.term.buffer.active;
  const row = bufferLineNumber - 1;
  const rows = collectWrappedRows(buffer, row);
  if (!rows.length) return undefined;

  const curIdx = row - rows[0].row;
  const found = findFileLinksAcrossRows(rows.map((r) => r.text), curIdx);
  if (!found.length) return undefined;

  return found.map((f) => {
    const markdown = isMarkdownPath(f.path);
    return {
      text: f.text,
      range: {
        start: { x: f.startCol, y: bufferLineNumber },
        end: { x: f.endCol, y: bufferLineNumber },
      },
      decorations: { pointerCursor: markdown, underline: true },
      activate: (event) => {
        if (event && event.metaKey) {
          noteFeatureUsed("file-link");
          openInViewer({ cwd: paneCwd(pane), path: f.path, line: f.line, from: "link" });
        }
        else if (markdown) openMdPreview(f.path, paneCwd(pane));
      },
    };
  });
}

export function wireFileLinks(pane) {
  const disposable = pane.term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) { callback(linksForLine(pane, bufferLineNumber)); },
  });
  providers.set(pane.id, disposable);
}

export function closeFileLinksFor(paneId) {
  const d = providers.get(paneId);
  if (!d) return;
  try { d.dispose(); } catch (_) {}
  providers.delete(paneId);
}
