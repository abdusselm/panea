// Static file serving for the web UI: whitelisted vendor libs from
// node_modules plus everything under public/, with path-traversal guarding.

import fs from "node:fs";
import path from "node:path";
import { PUBLIC_DIR, NODE_MODULES } from "./paths.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Vendor files pulled straight from node_modules so the UI has no external CDN
// dependency (works offline, nothing leaves the machine).
const VENDOR = {
  "/vendor/xterm.js": "@xterm/xterm/lib/xterm.js",
  "/vendor/xterm.css": "@xterm/xterm/css/xterm.css",
  "/vendor/addon-fit.js": "@xterm/addon-fit/lib/addon-fit.js",
  "/vendor/addon-search.js": "@xterm/addon-search/lib/addon-search.js",
};

function sendFile(res, filePath, mime) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    // no-store: local dev app, always serve the current file (never a stale
    // cached asset after an edit).
    res.writeHead(200, { "content-type": mime || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  });
}

export function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  if (VENDOR[pathname]) {
    const file = path.join(NODE_MODULES, VENDOR[pathname]);
    return sendFile(res, file, MIME[path.extname(file)]);
  }

  const target = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  sendFile(res, target, MIME[path.extname(target)] || "application/octet-stream");
}
