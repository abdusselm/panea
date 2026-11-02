import { wsSend } from "./ws.js";
import { renderMarkdown, linkKind, resolveRel, anchorId, slugify } from "./markdown.js";
import { sanitizedFragment } from "./md-sanitize.js";
import { loadVendor } from "./vendor-load.js";
import { findMatches } from "./file-view-model.js";

const ASSET_TIMEOUT_MS = 10000;
const FENCE = /^\s{0,3}(```|~~~)/m;

const pending = new Map();
let nextReqId = 1;

export function setFileAsset(msg) {
  const done = pending.get(msg.reqId);
  if (!done) return;
  pending.delete(msg.reqId);
  done(msg);
}

function requestAsset(root, path) {
  const reqId = nextReqId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(reqId); resolve(null); }, ASSET_TIMEOUT_MS);
    pending.set(reqId, (msg) => { clearTimeout(timer); resolve(msg); });
    wsSend({ type: "getFileAsset", reqId, root, path });
  });
}

export function needsHighlighter(content) {
  return FENCE.test(content);
}

function highlighterFor(hljs) {
  if (!hljs) return null;
  return (code, lang) => {
    if (!hljs.getLanguage(lang)) return null;
    try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; }
    catch (_) { return null; }
  };
}

function addCopyButtons(frag) {
  for (const pre of frag.querySelectorAll("pre.md-code")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "md-copy";
    btn.textContent = "Copy";
    btn.tabIndex = -1;
    pre.appendChild(btn);
  }
}

export async function buildDoc(content, hljs) {
  const lib = await loadVendor("/vendor/marked.js", "marked");
  if (!lib || typeof lib.Marked !== "function") return null;
  let html;
  try { html = renderMarkdown(lib, content, { allowHtml: true, highlight: highlighterFor(hljs) }); }
  catch (_) { return null; }
  const frag = sanitizedFragment(html);
  addCopyButtons(frag);
  return frag;
}

function missingImage(img, text) {
  const span = document.createElement("span");
  span.className = "md-img-missing";
  span.textContent = text;
  img.replaceWith(span);
}

export function loadDocImages(p) {
  const root = p.root;
  for (const img of p.docEl.querySelectorAll("img[data-md-src]")) {
    const src = img.dataset.mdSrc;
    img.removeAttribute("data-md-src");
    const rel = resolveRel(p.rel, src);
    const label = img.getAttribute("alt") || src;
    if (!rel || !root) { missingImage(img, label); continue; }
    requestAsset(root, rel).then((res) => {
      if (!img.isConnected) return;
      if (res && res.data && res.mime) img.src = "data:" + res.mime + ";base64," + res.data;
      else missingImage(img, label);
    });
  }
}

export function scrollToAnchor(p, hash) {
  let raw = String(hash || "").replace(/^#/, "");
  try { raw = decodeURIComponent(raw); } catch (_) {}
  if (!raw) return false;
  for (const id of [anchorId(raw), anchorId(slugify(raw)), raw]) {
    const el = p.docEl.querySelector("#" + CSS.escape(id));
    if (el) { el.scrollIntoView({ block: "start" }); return true; }
  }
  return false;
}

function copyCode(btn) {
  const code = btn.parentElement && btn.parentElement.querySelector("code");
  if (!code) return;
  try { navigator.clipboard.writeText(code.textContent).catch(() => {}); } catch (_) {}
  if (btn.classList.contains("done")) return;
  btn.textContent = "Copied";
  btn.classList.add("done");
  btn.parentElement.addEventListener("mouseleave", () => {
    btn.textContent = "Copy";
    btn.classList.remove("done");
  }, { once: true });
}

export function wireDoc(p, openFile) {
  p.docEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".md-copy");
    if (btn) { e.preventDefault(); copyCode(btn); return; }
    const a = e.target.closest("a[href]");
    if (!a || !p.docEl.contains(a)) return;
    e.preventDefault();
    const href = a.getAttribute("href");
    const kind = linkKind(href);
    if (kind === "anchor") scrollToAnchor(p, href);
    else if (kind === "external") window.open(href, "_blank", "noopener");
    else if (kind === "file") {
      const rel = resolveRel(p.rel, href);
      const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
      if (rel === p.rel) scrollToAnchor(p, hash);
      else if (rel) openFile(rel, hash);
    }
  });
}

export function docRanges(docEl, query) {
  const nodes = [];
  const walker = document.createTreeWalker(docEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest(".md-copy") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  return findMatches(nodes.map((n) => n.nodeValue), query).map((m) => {
    const r = document.createRange();
    r.setStart(nodes[m.line - 1], m.start);
    r.setEnd(nodes[m.line - 1], m.end);
    return r;
  });
}
