

import { spawn } from "node:child_process";
import { PY, BRIDGE, ZSH_THEME_DIR } from "./paths.js";

export class Pane {
  constructor(id, opts, onOutput, onExit) {
    this.id = id;
    const shell = process.env.SHELL || "/bin/zsh";
    const args = [BRIDGE, shell];
    if (opts.cwd) args.push("--cwd", opts.cwd);
    if (opts.cols) args.push("--cols", String(opts.cols));
    if (opts.rows) args.push("--rows", String(opts.rows));

    const env = { ...process.env };
    const themeOn = process.env.PANEA_NO_THEME !== "1";
    if (themeOn && /zsh$/.test(shell)) {
      env.ZDOTDIR = ZSH_THEME_DIR;
      env.PANEA_THEME_DIR = ZSH_THEME_DIR;
    }
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
