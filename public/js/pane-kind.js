export function isTerminalPane(pane) {
  return !!pane && !pane.kind;
}

export function isBrowserPane(pane) {
  return !!pane && pane.kind === "browser";
}

export function isViewerPane(pane) {
  return !!pane && pane.kind === "viewer";
}
