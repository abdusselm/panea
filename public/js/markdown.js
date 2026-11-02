import { escapeHtml } from "./buffer-html.js";

const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|mkdn)$/i;
const ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;
const FRONT_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const FLAT_YAML_LINE = /^([A-Za-z0-9_.-]+):[ \t]*(.*)$/;
const WORDS_PER_MINUTE = 220;
const ID_PREFIX = "md-";

export function isMarkdownFile(rel) {
  return MARKDOWN_EXT.test(String(rel || ""));
}

function escapeAttr(text) {
  return escapeHtml(String(text)).replace(/"/g, "&quot;");
}

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z0-9#]+;/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function anchorId(slug) {
  return ID_PREFIX + slug;
}

export function splitFrontMatter(src) {
  const text = String(src || "");
  const m = text.match(FRONT_RE);
  if (!m) return { front: null, body: text };
  const lines = m[1].split(/\r?\n/).filter((l) => l.trim());
  const flat = lines.every((l) => FLAT_YAML_LINE.test(l));
  const front = flat
    ? { pairs: lines.map((l) => { const [, k, v] = l.match(FLAT_YAML_LINE); return [k, v.replace(/^(["'])(.*)\1$/, "$2")]; }) }
    : { raw: m[1] };
  return { front, body: text.slice(m[0].length) };
}

function frontHtml(front) {
  if (!front) return "";
  if (front.pairs) {
    const rows = front.pairs.map(([k, v]) => "<dt>" + escapeHtml(k) + "</dt><dd>" + escapeHtml(v) + "</dd>").join("");
    return '<dl class="md-front">' + rows + "</dl>";
  }
  return '<pre class="md-code md-front-raw" data-lang="yaml"><code>' + escapeHtml(front.raw) + "</code></pre>";
}

export function readingStats(src) {
  const words = (String(src || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

export function linkKind(href) {
  const h = String(href || "").trim();
  if (!h) return "";
  if (h.startsWith("#")) return "anchor";
  if (/^(https?:|mailto:)/i.test(h)) return "external";
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith("//")) return "";
  return "file";
}

export function isImageSource(src) {
  const s = String(src || "").trim();
  if (/^data:image\//i.test(s)) return true;
  if (/^https?:/i.test(s)) return true;
  return linkKind(s) === "file";
}

export function resolveRel(fromRel, href) {
  let target = String(href || "").split("#")[0].split("?")[0];
  try { target = decodeURI(target); } catch (_) {}
  if (!target) return "";
  const parts = target.startsWith("/") ? [] : String(fromRel || "").split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

function alertOf(token) {
  const first = token.tokens && token.tokens[0];
  if (!first || first.type !== "paragraph") return null;
  const m = String(first.raw || "").match(ALERT_RE);
  return m ? { kind: m[1].toLowerCase(), marker: m[0] } : null;
}

const ALERT_TITLE = { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution" };

function makeRenderer(lib, opts, slugs) {
  const base = lib.Renderer.prototype;
  return {
    html({ text }) {
      return opts.allowHtml ? text : escapeHtml(text);
    },
    heading(token) {
      const inner = this.parser.parseInline(token.tokens);
      const slug = slugify(inner) || "section";
      const n = slugs.get(slug) || 0;
      slugs.set(slug, n + 1);
      const id = anchorId(n ? slug + "-" + n : slug);
      return "<h" + token.depth + ' id="' + escapeAttr(id) + '">' + inner + "</h" + token.depth + ">\n";
    },
    code({ text, lang }) {
      const name = String(lang || "").trim().split(/\s+/)[0].toLowerCase();
      const highlighted = name && opts.highlight ? opts.highlight(text, name) : null;
      const body = highlighted == null ? escapeHtml(text) : highlighted;
      const langAttr = name ? ' data-lang="' + escapeAttr(name) + '"' : "";
      return '<pre class="md-code"' + langAttr + '><code class="hljs">' + body + "</code></pre>\n";
    },
    blockquote(token) {
      const alert = alertOf(token);
      if (!alert) return base.blockquote.call(this, token);
      const inner = opts.parse(String(token.text || "").replace(ALERT_RE, ""));
      return '<div class="md-alert md-alert-' + alert.kind + '"><p class="md-alert-title">' +
        ALERT_TITLE[alert.kind] + "</p>" + inner + "</div>\n";
    },
    table(token) {
      return '<div class="md-table">' + base.table.call(this, token) + "</div>\n";
    },
    link(token) {
      const inner = this.parser.parseInline(token.tokens);
      if (!linkKind(token.href)) return inner;
      const title = token.title ? ' title="' + escapeAttr(token.title) + '"' : "";
      return '<a href="' + escapeAttr(token.href) + '"' + title + ">" + inner + "</a>";
    },
    image({ href, title, text }) {
      if (!isImageSource(href)) return escapeHtml(text);
      const t = title ? ' title="' + escapeAttr(title) + '"' : "";
      return '<img src="' + escapeAttr(href) + '" alt="' + escapeAttr(text) + '"' + t + ">";
    },
    checkbox({ checked }) {
      return '<input type="checkbox" class="md-task" disabled' + (checked ? " checked" : "") + "> ";
    },
  };
}

export function renderMarkdown(lib, src, opts = {}) {
  const { front, body } = splitFrontMatter(String(src || "").replace(/\r\n/g, "\n"));
  const slugs = new Map();
  const md = new lib.Marked({ gfm: true, breaks: false });
  const settings = { allowHtml: !!opts.allowHtml, highlight: opts.highlight, parse: (text) => md.parse(text) };
  md.use({ renderer: makeRenderer(lib, settings, slugs) });
  return frontHtml(front) + md.parse(body);
}
