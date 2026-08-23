

export const LONG_TASK_MS = 6000;

export const IDLE_MS = 900;

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
  /\?\s*$/,
];

export function looksLikePrompt(text) {
  if (!text) return false;
  return WAIT_PATTERNS.some((re) => re.test(text));
}

export function classifyIdle(term, busyMs) {
  if (looksLikePrompt(readTrailingText(term))) return "permission";
  if (busyMs >= LONG_TASK_MS) return "done";
  return null;
}

export const REASON_LABEL = {
  permission: "needs your permission",
  done: "finished",
  alert: "wants attention",
  notify: "notification",
};
