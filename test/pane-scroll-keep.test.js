import test from "node:test";
import assert from "node:assert/strict";

import { scrollSnapshot, keptViewport } from "../public/js/pane-scroll-keep.js";

test("a pane sitting at the bottom follows the new bottom", () => {
  const snap = scrollSnapshot(400, 400);
  assert.equal(keptViewport(snap, 380), 380);
});

test("one line of lag still counts as the bottom", () => {
  const snap = scrollSnapshot(399, 400);
  assert.equal(keptViewport(snap, 380), 380);
});

test("a pane scrolled back keeps its top line", () => {
  const snap = scrollSnapshot(120, 400);
  assert.equal(keptViewport(snap, 380), 120);
});

test("a kept line past the new bottom clamps to it", () => {
  const snap = scrollSnapshot(370, 400);
  assert.equal(keptViewport(snap, 100), 100);
});

test("no snapshot means no opinion about where to land", () => {
  assert.equal(keptViewport(null, 250), 250);
});
