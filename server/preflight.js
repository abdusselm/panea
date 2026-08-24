

import { spawnSync } from "node:child_process";

import { PY } from "./paths.js";

const PROBE = "import pty, tty, termios, fcntl; print(6 * 7)";
const EXPECTED = "42";

export function checkPython(python = PY) {
  const probe = spawnSync(python, ["-c", PROBE], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: 10000,
  });

  if (probe.error) {
    return { ok: false, reason: probe.error.code === "ENOENT" ? "missing" : probe.error.message };
  }

  if (/command line developer tools/i.test(probe.stderr || "")) {
    return { ok: false, reason: "clt" };
  }

  if (probe.status !== 0 || (probe.stdout || "").trim() !== EXPECTED) {
    const stderr = (probe.stderr || "").trim().split("\n").pop();
    return { ok: false, reason: stderr || "not a python3 interpreter" };
  }

  return { ok: true };
}

export function describePythonFailure(reason, python = PY, managed = Boolean(process.env.PANEA_PYTHON)) {
  const lines = [`panea: needs a working python3 to run terminals, and ${python} is not usable.`];

  if (reason === "missing") {
    lines.push("Nothing is installed at that path.");
  } else if (reason === "clt") {
    lines.push("macOS has the stub, but the Command Line Tools behind it are not installed.");
  } else {
    lines.push(`It failed with: ${reason}`);
  }

  lines.push("");

  if (managed) {
    lines.push("Homebrew installs python3 alongside panea, so this one has gone missing.");
    lines.push("Put it back with:");
    lines.push("  brew reinstall panea");
  } else {
    lines.push("Install it with:");
    lines.push("  brew install python@3.14");
  }

  lines.push("");
  lines.push("Or point panea at an interpreter you already have:");
  lines.push("  PANEA_PYTHON=/path/to/python3 panea");

  return lines.join("\n");
}

export function preflight() {
  const python = checkPython();
  if (python.ok) return true;
  console.error(describePythonFailure(python.reason));
  return false;
}
