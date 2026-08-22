#!/usr/bin/env node
// panea server entry: HTTP static UI + WebSocket terminal multiplexer.
//
// Each browser pane maps to one python3 PTY bridge child (see pty_bridge.py).
// We deliberately avoid native PTY addons (node-pty) because their prebuilt
// helper binaries are unsigned and get blocked by managed-device code-signing
// enforcement. python3 is Apple-signed and its `pty` module needs no helper.
//
// The implementation is split across server/: paths (config), static-server
// (asset serving), session-store / commands-store (~/.panea state), meta
// (sidebar context), pane (one PTY), and connection (per-socket wiring).

import http from "node:http";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";

import { PORT, HOST } from "./server/paths.js";
import { handleRequest } from "./server/static-server.js";
import { handleConnection } from "./server/connection.js";

const server = http.createServer(handleRequest);
const wss = new WebSocketServer({ server });
wss.on("connection", handleConnection);

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`panea-ready ${url}`); // sentinel the Electron shell waits for
  // Auto-open in the browser only when running standalone (not under Electron).
  if (!process.env.PANEA_NO_OPEN) {
    spawn("open", [url], { stdio: "ignore" }).on("error", () => {});
  }
});
