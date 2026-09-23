import test from "node:test";
import assert from "node:assert/strict";

import {
  TIPS, TIP_SHOW_LIMIT, tipContext, pickTip, tipIdsForFeature, mergeTipMemory, tipMemorySnapshot,
} from "../public/js/tips-model.js";

const fresh = () => ({ retired: new Set(), shown: new Map() });
const plain = tipContext({ paneCount: 1, tabCount: 1 });

test("the context reads git, ports and agents from any pane in the tab", () => {
  const ctx = tipContext({
    metas: [{ branch: "", ports: [], agent: "" }, { branch: "main", ports: [3000], agent: "claude" }],
    paneCount: 2, tabCount: 3, hasClosedTabs: true,
  });
  assert.deepEqual(ctx, { inRepo: true, hasPorts: true, hasAgent: true, paneCount: 2, tabCount: 3, hasClosedTabs: true });
  assert.deepEqual(tipContext(), { inRepo: false, hasPorts: false, hasAgent: false, paneCount: 0, tabCount: 0, hasClosedTabs: false });
});

test("a tip that fits the moment beats a general one", () => {
  assert.equal(pickTip({ ...plain, inRepo: true }, fresh()).id, "git-diff");
  assert.equal(pickTip({ ...plain, hasPorts: true }, fresh()).id, "browser-pane");
  assert.equal(pickTip({ ...plain, paneCount: 3 }, fresh()).id, "hide-pane");
});

test("with nothing specific going on, the first general tip is the palette", () => {
  assert.equal(pickTip(plain, fresh()).id, "command-palette");
});

test("a retired tip never comes back", () => {
  const memory = fresh();
  memory.retired.add("git-diff");
  assert.notEqual(pickTip({ ...plain, inRepo: true }, memory).id, "git-diff");
});

test("a tip shown enough times without being used stops showing", () => {
  const memory = fresh();
  memory.shown.set("command-palette", TIP_SHOW_LIMIT);
  assert.notEqual(pickTip(plain, memory).id, "command-palette");
});

test("tips of the same kind rotate: the one shown least goes next", () => {
  const memory = fresh();
  memory.shown.set("command-palette", 1);
  assert.equal(pickTip(plain, memory).id, "quick-open");
  memory.shown.set("quick-open", 1);
  assert.equal(pickTip(plain, memory).id, "split");
});

test("once every tip is retired there is nothing left to show", () => {
  const memory = fresh();
  for (const tip of TIPS) memory.retired.add(tip.id);
  assert.equal(pickTip({ ...plain, inRepo: true, hasAgent: true, paneCount: 4 }, memory), null);
});

test("using either split retires the split tip; a feature maps to its own tip by default", () => {
  assert.deepEqual(tipIdsForFeature("split-right"), ["split"]);
  assert.deepEqual(tipIdsForFeature("split-down"), ["split"]);
  assert.deepEqual(tipIdsForFeature("git-diff"), ["git-diff"]);
  assert.deepEqual(tipIdsForFeature("close-pane"), []);
});

test("every tip id is a valid settings key", () => {
  for (const tip of TIPS) assert.match(tip.id, /^[a-z0-9-]{1,40}$/);
  assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length);
});

test("merging stored memory keeps the union of retired tips and the larger shown count", () => {
  const memory = fresh();
  memory.retired.add("find");
  memory.shown.set("files", 2);
  memory.shown.set("split", 1);
  mergeTipMemory(memory, { retired: ["git-diff", 7], shown: { files: 1, split: 2, bad: "x" } });
  assert.deepEqual(tipMemorySnapshot(memory), { retired: ["find", "git-diff"], shown: { files: 2, split: 2 } });
  assert.doesNotThrow(() => mergeTipMemory(memory, null));
});
