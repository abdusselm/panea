import test from "node:test";
import assert from "node:assert/strict";

import { swapLeaves, moveLeaf } from "../public/js/pane-tree.js";

const leaf = (id) => ({ kind: "leaf", id });
const split = (dir, a, b, ratio = 0.5) => ({ kind: "split", dir, ratio, children: [a, b] });

const ids = (node) => (node.kind === "leaf" ? node.id : `(${node.dir} ${ids(node.children[0])} ${ids(node.children[1])})`);

test("swap exchanges two leaves under the same split", () => {
  const tree = split("v", leaf("a"), leaf("b"));
  assert.equal(ids(swapLeaves(tree, "a", "b")), "(v b a)");
});

test("swap exchanges leaves across different splits", () => {
  const tree = split("h", leaf("a"), split("v", leaf("b"), leaf("c")));
  assert.equal(ids(swapLeaves(tree, "a", "c")), "(h c (v b a))");
});

test("swap with the root leaf keeps every other pane in place", () => {
  const tree = split("h", leaf("a"), leaf("b"));
  assert.equal(ids(swapLeaves(tree, "a", "a")), "(h a b)");
});

test("move re-parents the dragged pane and collapses its old split", () => {
  const tree = split("h", leaf("a"), split("v", leaf("b"), leaf("c")));
  assert.equal(ids(moveLeaf(tree, "b", "a", "left")), "(h (h b a) c)");
});

test("move to the bottom puts the dragged pane second in a vertical split", () => {
  const tree = split("h", leaf("a"), split("v", leaf("b"), leaf("c")));
  assert.equal(ids(moveLeaf(tree, "a", "c", "bottom")), "(v b (v c a))");
});

test("move onto a sibling reorders without changing depth", () => {
  const tree = split("h", leaf("a"), leaf("b"));
  assert.equal(ids(moveLeaf(tree, "b", "a", "left")), "(h b a)");
});

test("a lone pane cannot be moved", () => {
  const tree = leaf("a");
  assert.equal(ids(moveLeaf(tree, "a", "a", "left")), "a");
});

test("an unknown side leaves the tree untouched", () => {
  const tree = split("h", leaf("a"), leaf("b"));
  assert.equal(ids(moveLeaf(tree, "a", "b", "center")), "(h a b)");
});
