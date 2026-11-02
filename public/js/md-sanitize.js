import { linkKind, isImageSource, anchorId } from "./markdown.js";

const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
  "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd", "li", "mark",
  "ol", "p", "pre", "q", "rp", "rt", "ruby", "s", "samp", "small", "span", "strong", "sub",
  "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
]);

const DROPPED_TAGS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "noscript", "template",
  "svg", "math", "form", "textarea", "select", "option", "button", "link", "meta", "base", "title",
  "head", "audio", "video", "source", "track", "canvas", "dialog", "portal",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "id", "name", "class", "align", "width", "height", "colspan", "rowspan",
  "open", "checked", "disabled", "type", "start", "reversed", "datetime", "lang", "data-lang",
]);

const CLASS_TOKEN = /^(md-|hljs|language-)/;
const SIZE = /^\d{1,5}(%|px)?$/;

function cleanAttrs(el) {
  for (const { name, value } of Array.from(el.attributes)) {
    if (!ALLOWED_ATTRS.has(name)) { el.removeAttribute(name); continue; }
    if (name === "href" && !linkKind(value)) el.removeAttribute(name);
    else if (name === "class") {
      const kept = value.split(/\s+/).filter((c) => CLASS_TOKEN.test(c)).join(" ");
      if (kept) el.setAttribute("class", kept); else el.removeAttribute("class");
    } else if ((name === "id" || name === "name") && value) {
      el.removeAttribute(name);
      el.id = value.startsWith("md-") ? value : anchorId(value);
    } else if ((name === "width" || name === "height") && !SIZE.test(value.trim())) el.removeAttribute(name);
  }
}

function cleanImage(img) {
  const src = (img.getAttribute("src") || "").trim();
  img.removeAttribute("src");
  if (!isImageSource(src)) { img.replaceWith(document.createTextNode(img.getAttribute("alt") || "")); return; }
  if (linkKind(src) === "file") img.dataset.mdSrc = src;
  else img.setAttribute("src", src);
  img.loading = "lazy";
  img.decoding = "async";
}

function cleanInput(input) {
  if ((input.getAttribute("type") || "").toLowerCase() !== "checkbox") { input.remove(); return; }
  input.disabled = true;
  input.classList.add("md-task");
}

function walk(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.localName;
    if (DROPPED_TAGS.has(tag)) { child.remove(); continue; }
    walk(child);
    if (!ALLOWED_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
    cleanAttrs(child);
    if (tag === "img") cleanImage(child);
    else if (tag === "input") cleanInput(child);
  }
}

export function sanitizedFragment(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  walk(tpl.content);
  return tpl.content;
}
