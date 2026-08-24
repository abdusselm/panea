

import http from "node:http";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";

import { PORT, HOST } from "./paths.js";
import { handleRequest } from "./static-server.js";
import { handleConnection } from "./connection.js";
import { verifyClient } from "./origin.js";

export function start({ open = false } = {}) {
  const server = http.createServer(handleRequest);
  const wss = new WebSocketServer({ server, verifyClient });
  wss.on("connection", handleConnection);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    wss.once("error", reject);
    server.listen(PORT, HOST, () => {
      const url = `http://${HOST}:${PORT}`;
      console.log(`panea-ready ${url}`);
      if (open) spawn("open", [url], { stdio: "ignore" }).on("error", () => {});
      resolve({ server, wss, url });
    });
  });
}
