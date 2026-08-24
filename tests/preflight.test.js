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

test("the failure message names the interpreter and both ways out", () => {
  const message = describePythonFailure("missing", "/usr/bin/python3");
  assert.match(message, /\/usr\/bin\/python3/);
  assert.match(message, /xcode-select --install/);
  assert.match(message, /PANEA_PYTHON=/);
});
