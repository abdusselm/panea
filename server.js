#!/usr/bin/env node
// panea server: static web UI + WebSocket terminal multiplexer.
//
// Each browser pane maps to one python3 PTY bridge child (see pty_bridge.py).
// We deliberately avoid native PTY addons (node-pty) because their prebuilt
// helper binaries are unsigned and get blocked by managed-device code-signing
// enforcement. python3 is Apple-signed and its `pty` module needs no helper.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PANEA_PORT || 4820);
const HOST = "127.0.0.1"; // local only, never bind public
const STATE_DIR = path.join(os.homedir(), ".panea");
const SESSION_FILE = path.join(STATE_DIR, "session.json");
const COMMANDS_FILE = path.join(STATE_DIR, "commands.json");
const PY = fs.existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3";
const BRIDGE = path.join(__dirname, "pty_bridge.py");

fs.mkdirSync(STATE_DIR, { recursive: true });

// ---- static file serving -------------------------------------------------

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

// Whitelisted vendor files pulled straight from node_modules so the UI has no
// external CDN dependency (works offline, nothing leaves the machine).
const VENDOR = {
  "/vendor/xterm.js": "@xterm/xterm/lib/xterm.js",
  "/vendor/xterm.css": "@xterm/xterm/css/xterm.css",
  "/vendor/addon-fit.js": "@xterm/addon-fit/lib/addon-fit.js",
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") pathname = "/index.html";

  if (VENDOR[pathname]) {
    const file = path.join(__dirname, "node_modules", VENDOR[pathname]);
    return sendFile(res, file, MIME[path.extname(file)]);
  }

  // Serve from public/, guarding against path traversal.
  const publicDir = path.join(__dirname, "public");
  const target = path.normalize(path.join(publicDir, pathname));
  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  sendFile(res, target, MIME[path.extname(target)] || "application/octet-stream");
});

// ---- session (layout) persistence ---------------------------------------

function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}

// Custom commands surface in the ⌘K palette. Accepts either a bare JSON array
// or an object with a "commands" array. Each entry: { name, run, where? }
// where ∈ { "focused" (default), "new-tab", "split", "split-down" }.
function loadCommands() {
  try {
    const c = JSON.parse(fs.readFileSync(COMMANDS_FILE, "utf8"));
    if (Array.isArray(c)) return c;
    if (c && Array.isArray(c.commands)) return c.commands;
    return [];
  } catch {
    return [];
  }
}

let saveTimer = null;
function saveSession(layout) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(SESSION_FILE, JSON.stringify(layout, null, 2), () => {});
  }, 150);
}

// ---- sidebar metadata (cwd / git branch / listening ports) --------------
// Read live per-pane context so the sidebar can show, cmux-style, where each
// terminal is and what it is serving. Everything is derived from the PTY
// process tree with lsof/git; no shell cooperation needed.

// Always resolve with stdout, even on a non-zero exit. lsof in particular
// exits 1 whenever it emits any warning (e.g. a pid it can't fully stat) yet
// still prints the matching rows we want; discarding stdout on error would
// drop every listening port. Callers tolerate empty output.
function run(cmd, args, timeoutMs = 1500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (_err, stdout) => {
      resolve(String(stdout || ""));
    });
  });
}

// Tool locations vary (lsof is in /usr/sbin, not /usr/bin, on some macOS
// installs); resolve via PATH to avoid brittle hard-coded paths.
const PGREP = "pgrep";
const LSOF = "lsof";

// Direct child pids of a pid (macOS `pgrep -P`).
async function childPids(pid) {
  const out = await run(PGREP, ["-P", String(pid)]);
  return out.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

// All descendant pids (BFS), including the shell and anything it launched.
async function descendantPids(rootPid, cap = 64) {
  const seen = new Set();
  let frontier = [String(rootPid)];
  while (frontier.length && seen.size < cap) {
    const next = [];
    for (const pid of frontier) {
      for (const c of await childPids(pid)) {
        if (!seen.has(c)) { seen.add(c); next.push(c); }
      }
    }
    frontier = next;
  }
  return [...seen];
}

// Working directory of a pid via `lsof -d cwd`.
async function pidCwd(pid) {
  const out = await run(LSOF, ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const line = out.split("\n").find((l) => l.startsWith("n"));
  return line ? line.slice(1).trim() : "";
}

async function gitBranch(cwd) {
  if (!cwd) return "";
  // --show-current works even in a fresh repo with no commits yet (unlike
  // `rev-parse HEAD`, which errors on an unborn branch). Detached HEAD -> "".
  const out = await run("git", ["-C", cwd, "branch", "--show-current"]);
  return out.trim();
}

// TCP ports the pane's process tree is LISTENing on (de-duplicated, sorted).
async function listeningPorts(pids) {
  if (!pids.length) return [];
  const out = await run(LSOF, ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", pids.join(","), "-Fn"]);
  const ports = new Set();
  for (const l of out.split("\n")) {
    if (!l.startsWith("n")) continue;
    const m = l.match(/:(\d+)$/);
    if (m) ports.add(Number(m[1]));
  }
  return [...ports].sort((a, b) => a - b);
}

// Compute the full metadata bundle for one pane, from its bridge pid.
async function computeMeta(bridgePid) {
  // The interactive shell is the bridge's (python) direct child; use its cwd
  // for the branch, and the whole tree for listening ports.
  const kids = await childPids(bridgePid);
  const shellPid = kids[0] || bridgePid;
  const cwd = await pidCwd(shellPid);
  const tree = await descendantPids(bridgePid);
  const [branch, ports] = await Promise.all([gitBranch(cwd), listeningPorts(tree)]);
  return { cwd, branch, ports };
}

// ---- terminal panes ------------------------------------------------------

class Pane {
  constructor(id, opts, onOutput, onExit) {
    this.id = id;
    const shell = process.env.SHELL || "/bin/zsh";
    const args = [BRIDGE, shell];
    if (opts.cwd) args.push("--cwd", opts.cwd);
    if (opts.cols) args.push("--cols", String(opts.cols));
    if (opts.rows) args.push("--rows", String(opts.rows));

    // Inject panea's zsh theme without touching the user's dotfiles: point
    // ZDOTDIR at our shim dir, which sources the user's real config and then
    // layers the cmux-style prompt on top. Only for zsh, and only when enabled.
    const env = { ...process.env };
    const themeOn = process.env.PANEA_NO_THEME !== "1";
    if (themeOn && /zsh$/.test(shell)) {
      const zdot = path.join(__dirname, "shell", "zsh");
      env.ZDOTDIR = zdot;
      env.PANEA_THEME_DIR = zdot;
    }
    // stdio: 0 in, 1 out, 2 err, 3 control
    this.child = spawn(PY, args, { stdio: ["pipe", "pipe", "inherit", "pipe"], env });
    this.control = this.child.stdio[3];
    this.child.stdout.on("data", (d) => onOutput(d));
    this.child.on("exit", (code) => onExit(code ?? 0));
    this.child.on("error", () => onExit(1));
  }
  write(data) {
    if (this.child.stdin.writable) this.child.stdin.write(data);
  }
  resize(cols, rows) {
    if (this.control && this.control.writable) {
      this.control.write(JSON.stringify({ t: "resize", cols, rows }) + "\n");
    }
  }
  kill() {
    try { this.child.kill("SIGTERM"); } catch {}
  }
}

// ---- WebSocket wiring -----------------------------------------------------

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const panes = new Map();

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  // Hand the freshly connected browser whatever layout we last persisted,
  // plus the user's custom command palette entries.
  send({ type: "session", layout: loadSession() });
  send({ type: "commands", commands: loadCommands() });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "open": {
        if (panes.has(msg.paneId)) return;
        const pane = new Pane(
          msg.paneId,
          { cwd: msg.cwd, cols: msg.cols, rows: msg.rows },
          (data) => send({ type: "output", paneId: msg.paneId, data: data.toString("base64") }),
          (code) => {
            panes.delete(msg.paneId);
            send({ type: "exit", paneId: msg.paneId, code });
          }
        );
        panes.set(msg.paneId, pane);
        if (!process.env.PANEA_NO_META_POLL) setTimeout(() => pollMeta(), 900); // surface cwd/branch/ports quickly
        break;
      }
      case "input": {
        const pane = panes.get(msg.paneId);
        if (pane) pane.write(Buffer.from(msg.data, "base64"));
        break;
      }
      case "resize": {
        const pane = panes.get(msg.paneId);
        if (pane) pane.resize(msg.cols, msg.rows);
        break;
      }
      case "close": {
        const pane = panes.get(msg.paneId);
        if (pane) { pane.kill(); panes.delete(msg.paneId); lastMeta.delete(msg.paneId); }
        break;
      }
      case "session": {
        saveSession(msg.layout);
        break;
      }
      case "getCommands": {
        // Re-read from disk so palette opens reflect edits without a restart.
        send({ type: "commands", commands: loadCommands() });
        break;
      }
    }
  });

  // Poll each pane's live context (cwd / branch / ports) and push updates when
  // anything changed. Sequential across panes to keep lsof/git pressure low.
  const lastMeta = new Map(); // paneId -> serialized meta
  let polling = false;
  const pollMeta = async () => {
    if (polling) return;
    polling = true;
    try {
      for (const [id, pane] of panes) {
        const pid = pane.child && pane.child.pid;
        if (!pid) continue;
        let meta;
        try { meta = await computeMeta(pid); } catch { continue; }
        if (!panes.has(id)) continue; // pane closed mid-poll
        const key = JSON.stringify(meta);
        if (lastMeta.get(id) === key) continue;
        lastMeta.set(id, key);
        send({ type: "meta", paneId: id, ...meta });
      }
    } finally {
      polling = false;
    }
  };
  const metaTimer = process.env.PANEA_NO_META_POLL ? null : setInterval(pollMeta, 3500);

  ws.on("close", () => {
    clearInterval(metaTimer);
    for (const pane of panes.values()) pane.kill();
    panes.clear();
    lastMeta.clear();
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`panea-ready ${url}`); // sentinel the Electron shell waits for
  // Auto-open in the browser only when running standalone (not under Electron).
  if (!process.env.PANEA_NO_OPEN) {
    spawn("open", [url], { stdio: "ignore" }).on("error", () => {});
  }
});
