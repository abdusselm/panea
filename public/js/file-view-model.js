import { escapeHtml } from "./buffer-html.js";

const BY_EXT = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
  json: "json", jsonc: "json", css: "css", scss: "scss", less: "less",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", plist: "xml", vue: "xml",
  md: "markdown", markdown: "markdown", py: "python", rb: "ruby", go: "go",
  rs: "rust", java: "java", kt: "kotlin", kts: "kotlin", swift: "swift",
  c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
  cs: "csharp", m: "objectivec", mm: "objectivec", php: "php",
  sh: "bash", bash: "bash", zsh: "bash", yml: "yaml", yaml: "yaml",
  toml: "ini", ini: "ini", cfg: "ini", conf: "ini", sql: "sql", lua: "lua",
  pl: "perl", pm: "perl", r: "r", graphql: "graphql", gql: "graphql",
  diff: "diff", patch: "diff", mk: "makefile", vb: "vbnet",
};

const BY_NAME = {
  makefile: "makefile", gnumakefile: "makefile",
  ".zshrc": "bash", ".zprofile": "bash", ".zshenv": "bash", ".bashrc": "bash", ".bash_profile": "bash", ".profile": "bash",
  ".gitconfig": "ini", ".editorconfig": "ini", ".npmrc": "ini",
};

export function languageFor(rel) {
  const name = String(rel || "").split("/").pop().toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const dot = name.lastIndexOf(".");
  return dot > 0 ? BY_EXT[name.slice(dot + 1)] || "" : "";
}

function dropFinalBreak(lines, content) {
  if (lines.length > 1 && /\r?\n$/.test(content) && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function textLines(content) {
  const text = String(content || "");
  return dropFinalBreak(text.split(/\r?\n/), text);
}

const TAG_RE = /<span[^>]*>|<\/span>|\r?\n/g;

export function splitHighlighted(html, content) {
  const lines = [];
  const open = [];
  let cur = "";
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    cur += html.slice(last, m.index);
    last = TAG_RE.lastIndex;
    const tok = m[0];
    if (tok === "</span>") {
      open.pop();
      cur += tok;
    } else if (tok.startsWith("<")) {
      open.push(tok);
      cur += tok;
    } else {
      lines.push(cur + "</span>".repeat(open.length));
      cur = open.join("");
    }
  }
  lines.push(cur + html.slice(last));
  if (lines.length > 1 && /\r?\n$/.test(String(content || "")) && lines[lines.length - 1].replace(/<[^>]*>/g, "") === "") lines.pop();
  return lines;
}

export function plainHtmlLines(content) {
  return textLines(content).map(escapeHtml);
}

export function lineMarkMap(marks, allAdded, lineCount) {
  const kinds = new Map();
  const dels = new Map();
  if (!lineCount) return { kinds, dels };
  if (allAdded) {
    for (let i = 1; i <= lineCount; i++) kinds.set(i, "add");
    return { kinds, dels };
  }
  for (const mk of marks || []) {
    if (mk.kind === "del") {
      if (mk.start <= lineCount) dels.set(Math.max(1, mk.start), "above");
      else dels.set(lineCount, "below");
      continue;
    }
    const end = Math.min(lineCount, mk.start + mk.count - 1);
    for (let i = Math.max(1, mk.start); i <= end; i++) kinds.set(i, mk.kind);
  }
  return { kinds, dels };
}

export const MAX_MATCHES = 2000;

export function findMatches(lines, query) {
  const out = [];
  const q = String(query || "").toLowerCase();
  if (!q) return out;
  for (let i = 0; i < lines.length && out.length < MAX_MATCHES; i++) {
    const hay = lines[i].toLowerCase();
    for (let at = hay.indexOf(q); at !== -1 && out.length < MAX_MATCHES; at = hay.indexOf(q, at + q.length)) {
      out.push({ line: i + 1, start: at, end: at + q.length });
    }
  }
  return out;
}

export function clampLine(line, lineCount) {
  const n = Math.floor(Number(line));
  if (!lineCount || !(n > 0)) return 0;
  return Math.min(n, lineCount);
}
