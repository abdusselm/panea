// Pure detection helpers that decide *why* a background pane deserves the
// user's attention. No app state, no DOM — given a terminal and timing, return
// a reason (or null). Keeping this separate lets attention.js stay about state
// and lets the heuristics be tuned/tested in isolation.

// A long-running job: the pane streamed output for at least this long before
// going quiet. Distinguishes "an agent worked on my task and finished" from a
// quick `ls`, which should stay silent.
export const LONG_TASK_MS = 6000;

// How long output must be quiet before we judge a pane idle.
export const IDLE_MS = 900;

// Read the last few non-empty rendered lines from an xterm terminal, so we can
// inspect what the program left on screen when it went quiet.
export function readTrailingText(term, maxLines = 6) {
  try {
    const buf = term.buffer.active;
    const end = buf.baseY + buf.cursorY;
    const lines = [];
    for (let y = end; y >= 0 && lines.length < maxLines; y--) {
      const line = buf.getLine(y);
      if (!line) continue;
      const s = line.translateToString(true).replace(/\s+$/, "");
      if (s) lines.unshift(s);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

// Markers that a program is waiting for the user to answer / grant permission.
// Matched against the trailing on-screen text, so they reflect the final state
// the program left, not something that scrolled by mid-run.
const WAIT_PATTERNS = [
  /\((?:y\/n|yes\/no|y\/N|Y\/n)\)/i,
  /\[(?:y\/n|Y\/n|y\/N)\]/i,
  /\bpress enter\b/i,
  /\bpress any key\b/i,
  /\bdo you want to\b/i,
  /\bwould you like to\b/i,
  /\ballow\b[^?\n]*\?/i,
  /\bgrant (?:permission|access)\b/i,
  /\b(?:proceed|continue|confirm|overwrite|approve)\??\s*[?:]/i,
  /\bwaiting for (?:input|confirmation|approval)\b/i,
  /❯\s*\d?\s*\.?\s*(?:yes|no|allow|deny|approve|reject)/i,
  /\?\s*$/,   // trailing line ends with a question mark
];

// Does the trailing text look like a program awaiting an answer?
export function looksLikePrompt(text) {
  if (!text) return false;
  return WAIT_PATTERNS.some((re) => re.test(text));
}

// Decide the reason to notify when a background pane goes idle, or null to stay
// silent. `busyMs` is how long the just-ended output burst lasted.
//   "permission" — the pane is waiting on the user (overrides everything)
//   "done"       — a long task finished and the pane went quiet
//   null         — ordinary short output; do not notify
export function classifyIdle(term, busyMs) {
  if (looksLikePrompt(readTrailingText(term))) return "permission";
  if (busyMs >= LONG_TASK_MS) return "done";
  return null;
}

// Human labels for each reason, shown in the panel and desktop notification.
export const REASON_LABEL = {
  permission: "needs your permission",
  done: "finished",
  alert: "wants attention",
  notify: "notification",
};
