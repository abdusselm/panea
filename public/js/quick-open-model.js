export const RESULT_LIMIT = 60;

const BOUNDARY = new Set(["/", ".", "-", "_", " "]);

export function parseQuery(raw) {
  const q = String(raw || "").trim();
  const m = q.match(/^(.*?):(\d+)(?::(\d+))?$/);
  if (m && m[1]) return { text: m[1].replace(/\s+/g, ""), line: Number(m[2]), col: m[3] ? Number(m[3]) : 0 };
  return { text: q.replace(/\s+/g, ""), line: 0, col: 0 };
}

export function baseStart(path) {
  return path.lastIndexOf("/") + 1;
}

export function prepare(files) {
  const list = Array.isArray(files) ? files : [];
  return { files: list, lower: list.map((f) => f.toLowerCase()), base: list.map(baseStart) };
}

function subsequence(path, lower, needle, from) {
  const positions = [];
  let score = 0;
  let at = from;
  let prev = -2;
  for (const ch of needle) {
    const i = lower.indexOf(ch, at);
    if (i === -1) return null;
    score += 1;
    if (i === prev + 1) score += 5;
    if (i === from || BOUNDARY.has(path[i - 1])) score += 8;
    else if (path[i] !== lower[i] && path[i - 1] === lower[i - 1]) score += 4;
    positions.push(i);
    prev = i;
    at = i + 1;
  }
  return { score, positions };
}

export function scorePath(path, lower, base, needle) {
  if (!needle) return { score: 1, positions: [] };
  if (!needle.includes("/")) {
    const inBase = subsequence(path, lower, needle, base);
    if (inBase) {
      const name = lower.slice(base);
      let score = inBase.score + 100;
      if (name === needle) score += 60;
      else if (name.startsWith(needle)) score += 30;
      return { score: score - path.length * 0.05, positions: inBase.positions };
    }
  }
  const full = subsequence(path, lower, needle, 0);
  if (!full) return null;
  return { score: full.score - full.positions[0] * 0.2 - path.length * 0.05, positions: full.positions };
}

export function rankFiles(prepared, query, { limit = RESULT_LIMIT, recent = [] } = {}) {
  const { files, lower, base } = prepared;
  const needle = String(query || "").toLowerCase().replace(/\s+/g, "");
  const recentRank = new Map(recent.map((r, i) => [r, recent.length - i]));
  if (!needle) {
    const known = new Set(files);
    const head = recent.filter((r) => known.has(r));
    const seen = new Set(head);
    const out = head.map((path) => ({ path, positions: [] }));
    for (const path of files) {
      if (out.length >= limit) break;
      if (!seen.has(path)) out.push({ path, positions: [] });
    }
    return out.slice(0, limit);
  }
  const hits = [];
  for (let i = 0; i < files.length; i++) {
    const r = scorePath(files[i], lower[i], base[i], needle);
    if (!r) continue;
    hits.push({ path: files[i], positions: r.positions, score: r.score + (recentRank.get(files[i]) || 0) * 2 });
  }
  hits.sort((a, b) => b.score - a.score || a.path.length - b.path.length || (a.path < b.path ? -1 : 1));
  return hits.slice(0, limit).map(({ path, positions }) => ({ path, positions }));
}

export function splitHighlight(text, positions, offset = 0) {
  const marks = new Set(positions.map((p) => p - offset).filter((p) => p >= 0 && p < text.length));
  const parts = [];
  for (let i = 0; i < text.length; i++) {
    const match = marks.has(i);
    const last = parts[parts.length - 1];
    if (last && last.match === match) last.text += text[i];
    else parts.push({ text: text[i], match });
  }
  return parts;
}

export function pushRecent(list, path, max = 20) {
  const next = [path, ...list.filter((p) => p !== path)];
  return next.slice(0, max);
}
