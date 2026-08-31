import test from "node:test";
import assert from "node:assert/strict";

const { railLayout } = await import("../public/js/pane-rail.js");

test("two visible panes keep the ratio the divider was dragged to", () => {
  const layout = railLayout(0.7, false, false);
  assert.equal(layout.first, 0.7);
  assert.ok(Math.abs(layout.second - 0.3) < 1e-9);
  assert.equal(layout.locked, false);
  assert.equal(layout.packed, false);
});

test("a split with no ratio yet falls back to an even one", () => {
  const layout = railLayout(undefined, false, false);
  assert.equal(layout.first, 0.5);
  assert.equal(layout.second, 0.5);
});

test("a hidden pane shrinks to its rail and hands the space to its sibling", () => {
  const first = railLayout(0.5, true, false);
  assert.equal(first.first, 0);
  assert.equal(first.second, 1);

  const second = railLayout(0.5, false, true);
  assert.equal(second.first, 1);
  assert.equal(second.second, 0);
});

test("the divider locks while either side is a rail, so a rail cannot be resized", () => {
  assert.equal(railLayout(0.5, true, false).locked, true);
  assert.equal(railLayout(0.5, false, true).locked, true);
  assert.equal(railLayout(0.5, false, false).locked, false);
});

test("two hidden siblings pack together instead of holding their share open", () => {
  const layout = railLayout(0.5, true, true);
  assert.equal(layout.first, 0);
  assert.equal(layout.second, 0);
  assert.equal(layout.packed, true);
});
