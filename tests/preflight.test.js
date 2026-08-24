import test from "node:test";
import assert from "node:assert/strict";

import { checkPython, describePythonFailure } from "../server/preflight.js";

test("accepts an interpreter that can import the pty modules", () => {
  assert.deepEqual(checkPython(process.execPath === "" ? "python3" : "/usr/bin/python3"), { ok: true });
});

test("reports a missing interpreter rather than throwing", () => {
  const result = checkPython("/nonexistent/python3");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing");
});

test("reports an interpreter that cannot import what the bridge needs", () => {
  const result = checkPython("/bin/echo");
  assert.equal(result.ok, false);
});

test("an installed copy is told to repair itself, not to go install python", () => {
  const message = describePythonFailure("missing", "/opt/homebrew/opt/python@3.14/bin/python3", true);
  assert.match(message, /brew reinstall panea/);
  assert.doesNotMatch(message, /brew install python/);
});

test("a checkout is given the install command, not an Xcode detour", () => {
  const message = describePythonFailure("missing", "/usr/bin/python3", false);
  assert.match(message, /\/usr\/bin\/python3/);
  assert.match(message, /brew install python@/);
  assert.doesNotMatch(message, /xcode-select/);
  assert.match(message, /PANEA_PYTHON=/);
});
