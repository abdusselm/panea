export const MIN_PANEL_W = 160;
export const MAX_PANEL_W = 600;

export function clampPanelWidth(w) {
  const n = Number(w);
  return Math.max(MIN_PANEL_W, Math.min(MAX_PANEL_W, Math.round(n > 0 ? n : 260)));
}

export function baseName(p) {
  const trimmed = String(p || "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed || "/";
}

export function childRel(rel, name) {
  return rel ? rel + "/" + name : name;
}

export function parentRel(rel) {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

export function isDirEntry(entry) {
  return entry.type === "dir" || entry.type === "link-dir";
}

export function statusCode(x, y) {
  if (x === "?" && y === "?") return "U";
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) return "C";
  if (x === "R" || x === "C") return "R";
  if (x === "A") return "A";
  if (x === "D" || y === "D") return "D";
  return "M";
}

export function decorate(files) {
  const byPath = new Map();
  const dirs = new Set();
  for (const f of files || []) {
    if (!f || !f.path) continue;
    const p = f.path.replace(/\/$/, "");
    byPath.set(p, statusCode(f.x, f.y));
    for (let d = parentRel(p); d; d = parentRel(d)) {
      if (dirs.has(d)) break;
      dirs.add(d);
    }
  }
  return { files: byPath, dirs };
}

const SAFE = /^[A-Za-z0-9_\-./:@%+=,]+$/;

export function shellQuote(s) {
  const str = String(s);
  if (SAFE.test(str)) return str;
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

export function absPath(root, rel) {
  return rel ? root.replace(/\/$/, "") + "/" + rel : root;
}

export function pathForPane(root, rel, paneCwd) {
  const abs = absPath(root, rel);
  const cwd = (paneCwd || "").replace(/\/$/, "");
  if (!cwd) return abs;
  if (abs === cwd) return ".";
  if (abs.startsWith(cwd + "/")) return abs.slice(cwd.length + 1);
  return abs;
}

export function flattenTree(listings, expanded, rel = "", depth = 0, out = []) {
  const listing = listings.get(rel);
  if (!listing || !listing.entries) return out;
  for (const e of listing.entries) {
    const r = childRel(rel, e.name);
    const dir = isDirEntry(e);
    const open = dir && !e.outside && expanded.has(r);
    out.push({
      rel: r, name: e.name, type: e.type, depth, dir, open,
      ignored: !!e.ignored, outside: !!e.outside,
      loading: open && !listings.has(r),
    });
    if (open) flattenTree(listings, expanded, r, depth + 1, out);
  }
  if (listing.truncated) out.push({ rel: rel + "\0more", more: listing.truncated, depth });
  return out;
}

export function openDirs(expanded) {
  const visible = [...expanded].filter((r) => {
    for (let d = parentRel(r); d; d = parentRel(d)) if (!expanded.has(d)) return false;
    return true;
  });
  return ["", ...visible.sort()];
}

export function pruneExpanded(expanded, rel) {
  for (const r of [...expanded]) if (r === rel || r.startsWith(rel + "/")) expanded.delete(r);
}
