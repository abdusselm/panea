export const TIP_GAP_MS = 10 * 60 * 1000;
export const TIP_SHOW_LIMIT = 3;

const CONTEXTUAL = 2;
const GENERAL = 1;

export const TIPS = [
  { id: "git-diff", when: (c) => c.inRepo,
    parts: [{ key: "git-diff" }, " opens the changed files and their diffs"] },
  { id: "browser-pane", when: (c) => c.hasPorts,
    parts: ["A server is listening here — ", { key: "browser-pane" }, " opens a browser pane beside it"] },
  { id: "transcript", when: (c) => c.hasAgent,
    parts: [{ key: "transcript" }, " folds a long agent session into your prompts"] },
  { id: "jump-latest", when: (c) => c.hasAgent,
    parts: [{ key: "jump-latest" }, " jumps to the latest output, and back again"] },
  { id: "reopen-tab", when: (c) => c.hasClosedTabs,
    parts: ["Closed a tab by mistake? ", { key: "reopen-tab" }, " brings it back"] },
  { id: "hide-pane", when: (c) => c.paneCount >= 3,
    parts: [{ key: "hide-pane" }, " folds a pane to a slim rail — it keeps running"] },
  { id: "pane-arrange", when: (c) => c.paneCount >= 3,
    parts: ["Drag a pane's header onto another pane to move or swap it"] },
  { id: "layouts", when: (c) => c.paneCount >= 3,
    parts: ["Keep this setup: ", { key: "command-palette" }, " → “Save this tab as layout”"] },
  { id: "pane-identity", when: (c) => c.paneCount >= 2,
    parts: ["Right-click a pane's header to rename it or give it a color"] },
  { id: "switch-tab", when: (c) => c.tabCount >= 2,
    parts: [{ chord: "⌘1–9" }, " jumps straight to a tab"] },
  { id: "command-palette",
    parts: [{ key: "command-palette" }, " opens the command palette — every action, searchable"] },
  { id: "quick-open",
    parts: [{ key: "quick-open" }, " jumps to any file in the project"] },
  { id: "split", features: ["split-right", "split-down"],
    parts: [{ key: "split-right" }, " splits right, ", { key: "split-down" }, " splits down"] },
  { id: "files",
    parts: [{ key: "files" }, " opens the Files panel for this folder"] },
  { id: "file-link",
    parts: [{ chord: "⌘-click" }, " a file path in the terminal to open it in the viewer"] },
  { id: "find",
    parts: [{ key: "find" }, " searches this terminal's scrollback"] },
];

export function tipContext({ metas = [], paneCount = 0, tabCount = 0, hasClosedTabs = false } = {}) {
  return {
    inRepo: metas.some((m) => m && m.branch),
    hasPorts: metas.some((m) => m && Array.isArray(m.ports) && m.ports.length > 0),
    hasAgent: metas.some((m) => m && m.agent),
    paneCount,
    tabCount,
    hasClosedTabs: !!hasClosedTabs,
  };
}

export function pickTip(ctx, memory, catalog = TIPS) {
  let best = null, bestWeight = 0, bestShown = 0;
  for (const tip of catalog) {
    if (memory.retired.has(tip.id)) continue;
    const shown = memory.shown.get(tip.id) || 0;
    if (shown >= TIP_SHOW_LIMIT) continue;
    if (tip.when && !tip.when(ctx)) continue;
    const weight = tip.when ? CONTEXTUAL : GENERAL;
    if (!best || weight > bestWeight || (weight === bestWeight && shown < bestShown)) {
      best = tip; bestWeight = weight; bestShown = shown;
    }
  }
  return best;
}

export function tipIdsForFeature(featureId, catalog = TIPS) {
  return catalog.filter((tip) => (tip.features || [tip.id]).includes(featureId)).map((tip) => tip.id);
}

export function mergeTipMemory(memory, incoming) {
  const src = incoming && typeof incoming === "object" ? incoming : {};
  if (Array.isArray(src.retired)) for (const id of src.retired) if (typeof id === "string") memory.retired.add(id);
  if (src.shown && typeof src.shown === "object") {
    for (const [id, count] of Object.entries(src.shown)) {
      if (Number.isInteger(count) && count > (memory.shown.get(id) || 0)) memory.shown.set(id, count);
    }
  }
  return memory;
}

export function tipMemorySnapshot(memory) {
  return { retired: [...memory.retired], shown: Object.fromEntries(memory.shown) };
}
