import test from "node:test";
import assert from "node:assert/strict";

import { onShutdown, runShutdown, pendingCount } from "../server/shutdown.js";

test("a released teardown never runs", () => {
  let calls = 0;
  const release = onShutdown(() => { calls += 1; });
  assert.equal(pendingCount(), 1);
  release();
  assert.equal(pendingCount(), 0);
  runShutdown();
  assert.equal(calls, 0);
});

test("teardowns run once, not once per shutdown path", () => {
  let calls = 0;
  onShutdown(() => { calls += 1; });
  runShutdown();
  runShutdown();
  assert.equal(calls, 1);
});

test("one teardown throwing does not strand the others", () => {
  const seen = [];
  onShutdown(() => { seen.push("first"); throw new Error("boom"); });
  onShutdown(() => { seen.push("second"); });
  runShutdown();
  assert.deepEqual(seen, ["first", "second"]);
});
