

import { findLeaf, findParentOf } from "./util.js";

export const DROP_SIDES = ["left", "right", "top", "bottom"];

export function swapLeaves(tree, aId, bId) {
  if (!tree || aId === bId) return tree;
  const a = findLeaf(tree, aId, null);
  const b = findLeaf(tree, bId, null);
  if (!a || !b) return tree;
  let root = tree;
  const ai = a.parent ? a.parent.children.indexOf(a.node) : -1;
  const bi = b.parent ? b.parent.children.indexOf(b.node) : -1;
  if (a.parent) a.parent.children[ai] = b.node; else root = b.node;
  if (b.parent) b.parent.children[bi] = a.node; else root = a.node;
  return root;
}

export function moveLeaf(tree, dragId, targetId, side) {
  if (!tree || dragId === targetId || !DROP_SIDES.includes(side)) return tree;
  const drag = findLeaf(tree, dragId, null);
  const target = findLeaf(tree, targetId, null);
  if (!drag || !target || !drag.parent) return tree;

  let root = tree;
  const sibling = drag.parent.children.find((c) => c !== drag.node);
  const grand = findParentOf(root, drag.parent, null);
  if (grand) grand.children[grand.children.indexOf(drag.parent)] = sibling;
  else root = sibling;

  const spot = findLeaf(root, targetId, null);
  if (!spot) return root;

  const dir = side === "left" || side === "right" ? "h" : "v";
  const before = side === "left" || side === "top";
  const split = {
    kind: "split",
    dir,
    ratio: 0.5,
    children: before ? [drag.node, spot.node] : [spot.node, drag.node],
  };
  if (spot.parent) spot.parent.children[spot.parent.children.indexOf(spot.node)] = split;
  else root = split;
  return root;
}
