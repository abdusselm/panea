const TOKEN_RE = /[\w@+~./-]+(?::\d+(?::\d+)?)?/g;
const SUFFIX_RE = /:(\d+)(?::(\d+))?$/;
const EXT_RE = /\.([A-Za-z][\w-]*)$/;
const ANCHORED_RE = /^(?:\/|\.{1,2}\/|~\/)/;

const KNOWN_EXT = new Set([
  "js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "jsonc", "css", "scss", "less",
  "html", "htm", "xml", "svg", "plist", "vue", "md", "markdown", "mdx", "py", "rb", "go", "rs",
  "java", "kt", "kts", "swift", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "m", "mm", "php",
  "sh", "bash", "zsh", "yml", "yaml", "toml", "ini", "cfg", "conf", "sql", "lua", "pl", "pm",
  "graphql", "gql", "diff", "patch", "mk", "txt", "log", "lock", "env", "csv", "tsv", "gitignore",
]);

function looksLikeFile(p) {
  const last = p.split("/").pop();
  if (!last || /^\.+$/.test(last) || p.startsWith("//")) return false;
  const ext = last.match(EXT_RE);
  if (p.includes("/")) return !!ext || ANCHORED_RE.test(p);
  return !!ext && KNOWN_EXT.has(ext[1].toLowerCase());
}

export function findFileLinks(text) {
  const links = [];
  const s = String(text || "");
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(s))) {
    let token = m[0];
    const before = s[m.index - 1] || "";
    if (before === ":" || before === "\\") continue;
    const suffix = token.match(SUFFIX_RE);
    let path = suffix ? token.slice(0, -suffix[0].length) : token;
    if (!suffix) {
      path = path.replace(/[.]+$/, "");
      token = path;
    }
    if (!looksLikeFile(path)) continue;
    links.push({
      text: token,
      path,
      line: suffix ? Number(suffix[1]) : 0,
      col: suffix && suffix[2] ? Number(suffix[2]) : 0,
      startCol: m.index + 1,
      endCol: m.index + token.length,
    });
  }
  return links;
}

export function findFileLinksAcrossRows(rowTexts, currentRowIndex) {
  if (rowTexts.length === 1) return findFileLinks(rowTexts[0]);
  let joined = "";
  const offsets = [];
  for (const t of rowTexts) { offsets.push(joined.length); joined += t; }
  const curOffset = offsets[currentRowIndex];
  const curLen = rowTexts[currentRowIndex].length;
  const links = [];
  for (const f of findFileLinks(joined)) {
    const s = f.startCol - 1, e = f.endCol;
    if (e <= curOffset || s >= curOffset + curLen) continue;
    links.push({
      ...f,
      startCol: Math.max(s, curOffset) - curOffset + 1,
      endCol: Math.min(e, curOffset + curLen) - curOffset,
    });
  }
  return links;
}

export function isMarkdownPath(p) {
  return /\.md$/i.test(String(p || ""));
}
