#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";

import { PORT, HOST } from "./server/paths.js";
import { handleRequest } from "./server/static-server.js";
import { handleConnection } from "./server/connection.js";
import { verifyClient } from "./server/origin.js";

// Otherwise this shows up as "Electron" in ps/Activity Monitor, because the
// desktop build runs it through the Electron binary with ELECTRON_RUN_AS_NODE.
process.title = "panea-server";

const server = http.createServer(handleRequest);
const wss = new WebSocketServer({ server, verifyClient });
wss.on("connection", handleConnection);

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`panea-ready ${url}`);

  if (!process.env.PANEA_NO_OPEN) {
    spawn("open", [url], { stdio: "ignore" }).on("error", () => {});
  }
});
