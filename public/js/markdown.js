

import { escapeHtml } from "./buffer-html.js";

const LINK_SCHEME = /^(https?:|mailto:|#)/i;

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function inline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, (_, code) => "<code>" + code + "</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safe = LINK_SCHEME.test(href) ? href : "#";
    return '<a href="' + escapeAttr(safe) + '" target="_blank" rel="noopener">' + label + "</a>";
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return html;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^>\s?/;
const OL_RE = /^\s*\d+[.)]\s+/;
const UL_RE = /^\s*[-*+]\s+/;
const FENCE_RE = /^```/;

export function mdToHtml(src) {
  const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      const langAttr = lang ? ' data-lang="' + escapeAttr(lang) + '"' : "";
      out.push('<pre class="md-code"><code' + langAttr + ">" + escapeHtml(code.join("\n")) + "</code></pre>");
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1].length;
      out.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
      i++;
      continue;
    }

    if (HR_RE.test(line)) { out.push("<hr>"); i++; continue; }

    if (QUOTE_RE.test(line)) {
      const quote = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) { quote.push(lines[i].replace(QUOTE_RE, "")); i++; }
      out.push("<blockquote>" + inline(quote.join(" ")) + "</blockquote>");
      continue;
    }

    if (OL_RE.test(line) || UL_RE.test(line)) {
      const ordered = OL_RE.test(line);
      const itemRe = ordered ? OL_RE : UL_RE;
      const items = [];
      while (i < lines.length && itemRe.test(lines[i])) {
        items.push("<li>" + inline(lines[i].replace(itemRe, "")) + "</li>");
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
      continue;
    }

    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !FENCE_RE.test(lines[i]) && !HEADING_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) && !QUOTE_RE.test(lines[i]) &&
      !OL_RE.test(lines[i]) && !UL_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push("<p>" + inline(para.join(" ")) + "</p>");
  }
  return out.join("\n");
}
