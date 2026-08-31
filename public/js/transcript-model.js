

const TURN_START = /^\s*(⏺|✻|❯|➜|\$\s)/;
const TITLE_MAX = 90;

function tidy(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > TITLE_MAX ? clean.slice(0, TITLE_MAX - 1) + "…" : clean;
}

function firstWords(lineText, start, end) {
  for (let i = start; i <= end; i++) {
    const t = tidy(lineText(i)).replace(TURN_START, "").trim();
    if (t) return t;
  }
  return "";
}

function sectionsFrom(bounds, lineCount, lineText, titles) {
  const out = [];
  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i];
    const end = (i + 1 < bounds.length ? bounds[i + 1] : lineCount) - 1;
    if (end < start) continue;
    out.push({
      start,
      end,
      lines: end - start + 1,
      title: tidy(titles[i]) || firstWords(lineText, start, end) || "output",
    });
  }
  return out;
}

export function splitSections({ lineCount, marks = [], lineText }) {
  if (!lineCount || typeof lineText !== "function") return [];

  const asked = marks
    .filter((m) => m && m.line >= 0 && m.line < lineCount)
    .sort((a, b) => a.line - b.line);

  if (asked.length >= 2) {
    const bounds = asked.map((m) => m.line);
    const titles = asked.map((m) => m.text);
    if (bounds[0] > 0) {
      bounds.unshift(0);
      titles.unshift("earlier output");
    }
    return sectionsFrom(bounds, lineCount, lineText, titles);
  }

  const bounds = [];
  for (let i = 0; i < lineCount; i++) {
    if (TURN_START.test(lineText(i) || "")) bounds.push(i);
  }
  if (!bounds.length) return sectionsFrom([0], lineCount, lineText, [""]);
  if (bounds[0] > 0) bounds.unshift(0);
  return sectionsFrom(bounds, lineCount, lineText, []);
}
