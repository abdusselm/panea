#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const HELP = `panea ${pkg.version} — local multi-pane terminal workspace

Usage
  panea                  serve the browser build and open it
  panea --app            open the desktop window
  panea --port <n>       listen on <n> instead of 4820
  panea --no-update      skip the update check for this run
  panea --version        print the version
  panea --help           print this

Environment
  PANEA_PORT             same as --port
  PANEA_NO_UPDATE=1      never check for updates
  PANEA_NO_THEME=1       leave the shell prompt untouched
  PANEA_STATE_DIR        where session/settings live (default ~/.panea)
`;

function parse(argv) {
  const opts = { app: false, update: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--app" || arg === "-a") opts.app = true;
    else if (arg === "--no-update") opts.update = false;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--version" || arg === "-v") opts.version = true;
    else if (arg === "--port" || arg === "-p") opts.port = argv[++i];
    else if (arg.startsWith("--port=")) opts.port = arg.slice("--port=".length);
    else {
      console.error(`panea: unknown option ${arg}\n`);
      console.error(HELP);
      process.exit(1);
    }
  }
  return opts;
}

async function electronExecutable() {
  const { resolveExecutable } = await import("../server/electron.js");

  let executable = resolveExecutable(ROOT);
  if (executable) return executable;

  const installer = path.join(ROOT, "scripts", "ensure-electron.mjs");
  spawnSync(process.execPath, [installer], { stdio: "inherit" });

  executable = resolveExecutable(ROOT);
  if (executable) {
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "brand-dev-electron.mjs")], {
      stdio: "inherit",
    });
  }
  return resolveExecutable(ROOT);
}

async function runDesktop() {
  const electron = await electronExecutable();
  if (!electron) {
    console.error("panea: the desktop build needs the Electron runtime, which could not be installed.");
    console.error("The browser build still works — run `panea` on its own.");
    process.exit(1);
  }

  const child = spawn(electron, [ROOT], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error(`panea: could not start the desktop window — ${err.message}`);
    process.exit(1);
  });
}

async function runBrowser() {
  const { start } = await import("../server/start.js");
  try {
    await start({ open: !process.env.PANEA_NO_OPEN });
  } catch (err) {
    console.error(`panea: ${err.message}`);
    process.exit(1);
  }
}

const opts = parse(process.argv.slice(2));

if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

if (opts.version) {
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

if (opts.port) {
  if (!/^\d+$/.test(opts.port)) {
    console.error(`panea: --port needs a number, got "${opts.port}"`);
    process.exit(1);
  }
  process.env.PANEA_PORT = opts.port;
}

const { preflight } = await import("../server/preflight.js");
if (!preflight()) process.exit(1);

if (opts.update) {
  const { maybeSelfUpdate } = await import("../server/update.js");
  await maybeSelfUpdate({ root: ROOT, pkg, argv: process.argv.slice(2) });
}

if (opts.app) await runDesktop();
else await runBrowser();
