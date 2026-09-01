import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PY, BRIDGE, ZSH_THEME_DIR } from "../server/paths.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ZSH = "/bin/zsh";
const haveZsh = fs.existsSync(ZSH);

function shimEnv(home, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: home,
    TERM: "xterm-256color",
    ZDOTDIR: ZSH_THEME_DIR,
    PANEA_THEME_DIR: ZSH_THEME_DIR,
    ...extra,
  };
}

function tempHome(zshrc) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "panea-zsh-"));
  fs.writeFileSync(path.join(home, ".zshrc"), zshrc);
  return home;
}

function runShim(home, extra) {
  return execFileSync(ZSH, ["-c", "print -r -- ${POWERLEVEL9K_INSTANT_PROMPT-unset}"], {
    env: shimEnv(home, extra),
    encoding: "utf8",
  }).trim();
}

test("the shim switches powerlevel10k instant prompt off", { skip: !haveZsh }, () => {
  const home = tempHome("");
  assert.equal(runShim(home), "off");
});

test("the shim leaves instant prompt alone when the theme is disabled", { skip: !haveZsh }, () => {
  const home = tempHome("");
  assert.equal(runShim(home, { PANEA_NO_THEME: "1" }), "unset");
});

const CAPTURING_PROMPT_TOOL = `
if [[ $POWERLEVEL9K_INSTANT_PROMPT != off ]]; then
  exec {__panea_saved}>&1
  exec >"$HOME/captured.txt"
  _p9k_precmd() { exec 1>&$__panea_saved; }
  precmd_functions+=(_p9k_precmd)
fi
`;

test(
  "a prompt tool that captures stdout until its precmd hook runs cannot swallow command output",
  { skip: !haveZsh, timeout: 40000 },
  async () => {
    const home = tempHome(CAPTURING_PROMPT_TOOL);
    const child = spawn(PY, [BRIDGE, ZSH, "--cwd", ROOT, "--cols", "100", "--rows", "30"], {
      stdio: ["pipe", "pipe", "ignore", "pipe"],
      env: shimEnv(home),
    });

    let seen = "";
    child.stdout.on("data", (chunk) => {
      seen += chunk.toString("utf8");
    });

    const marker = "PANEA_OUTPUT_REACHED_THE_TERMINAL";
    await new Promise((resolve) => setTimeout(resolve, 4000));
    child.stdin.write(`print ${marker.slice(0, 5)}""${marker.slice(5)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    child.kill("SIGTERM");

    const captured = path.join(home, "captured.txt");
    assert.equal(fs.existsSync(captured), false, "instant prompt should never have captured stdout");
    assert.ok(seen.includes(marker), "command output never reached the terminal");
  }
);
