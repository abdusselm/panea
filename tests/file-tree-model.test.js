import test from "node:test";
import assert from "node:assert/strict";

import {
  childRel, parentRel, statusCode, decorate, shellQuote, pathForPane,
  flattenTree, openDirs, pruneExpanded, clampPanelWidth, baseName,
} from "../public/js/file-tree-model.js";

test("relative paths join and split on the tree's slash", () => {
  assert.equal(childRel("", "src"), "src");
  assert.equal(childRel("src", "a.js"), "src/a.js");
  assert.equal(parentRel("src/lib/a.js"), "src/lib");
  assert.equal(parentRel("a.js"), "");
});

test("porcelain XY pairs collapse to one tree badge", () => {
  assert.equal(statusCode("?", "?"), "U");
  assert.equal(statusCode("A", " "), "A");
  assert.equal(statusCode("A", "M"), "A");
  assert.equal(statusCode(" ", "M"), "M");
  assert.equal(statusCode("M", "M"), "M");
  assert.equal(statusCode(" ", "D"), "D");
  assert.equal(statusCode("D", " "), "D");
  assert.equal(statusCode("R", " "), "R");
  assert.equal(statusCode("U", "U"), "C");
  assert.equal(statusCode("A", "A"), "C");
});

test("a change marks every ancestor folder, including for a deleted file", () => {
  const { files, dirs } = decorate([
    { path: "src/lib/a.js", x: " ", y: "M" },
    { path: "docs/gone.md", x: " ", y: "D" },
    { path: "top.txt", x: "?", y: "?" },
  ]);
  assert.equal(files.get("src/lib/a.js"), "M");
  assert.equal(files.get("docs/gone.md"), "D");
  assert.equal(files.get("top.txt"), "U");
  assert.deepEqual([...dirs].sort(), ["docs", "src", "src/lib"]);
});

test("shell quoting leaves plain paths bare and makes the rest literal", () => {
  assert.equal(shellQuote("src/app.js"), "src/app.js");
  assert.equal(shellQuote("/Users/me/my file.txt"), "'/Users/me/my file.txt'");
  assert.equal(shellQuote("it's.md"), "'it'\\''s.md'");
  assert.equal(shellQuote("$HOME!`x`"), "'$HOME!`x`'");
  assert.equal(shellQuote(""), "''");
});

test("a path under the pane's cwd is written relative, anything else absolute", () => {
  assert.equal(pathForPane("/r", "src/a.js", "/r"), "src/a.js");
  assert.equal(pathForPane("/r", "src/a.js", "/r/src"), "a.js");
  assert.equal(pathForPane("/r", "src", "/r/src/"), ".");
  assert.equal(pathForPane("/r", "README.md", "/r/src"), "/r/README.md");
  assert.equal(pathForPane("/r", "srcx/a.js", "/r/src"), "/r/srcx/a.js");
  assert.equal(pathForPane("/r", "a.js", ""), "/r/a.js");
  assert.equal(pathForPane("/r", "", "/elsewhere"), "/r");
});

test("only expanded folders contribute rows, nested under their parent", () => {
  const listings = new Map([
    ["", { entries: [{ name: "src", type: "dir" }, { name: "a.txt", type: "file", ignored: true }], truncated: 0 }],
    ["src", { entries: [{ name: "b.js", type: "file" }], truncated: 0 }],
  ]);
  const closed = flattenTree(listings, new Set());
  assert.deepEqual(closed.map((r) => [r.rel, r.depth, r.open]), [["src", 0, false], ["a.txt", 0, false]]);
  assert.equal(closed[1].ignored, true);

  const open = flattenTree(listings, new Set(["src"]));
  assert.deepEqual(open.map((r) => r.rel), ["src", "src/b.js", "a.txt"]);
  assert.equal(open[1].depth, 1);
});

test("an expanded folder whose listing has not arrived shows as loading", () => {
  const listings = new Map([["", { entries: [{ name: "lib", type: "dir" }], truncated: 0 }]]);
  const [row] = flattenTree(listings, new Set(["lib"]));
  assert.equal(row.open, true);
  assert.equal(row.loading, true);
});

test("a symlink escaping the root never expands, and a capped folder adds a 'more' row", () => {
  const listings = new Map([["", { entries: [{ name: "out", type: "link-dir", outside: true }], truncated: 7 }]]);
  const rows = flattenTree(listings, new Set(["out"]));
  assert.equal(rows[0].open, false);
  assert.equal(rows[1].more, 7);
});

test("a refresh re-lists only folders that are actually visible", () => {
  const expanded = new Set(["src", "src/lib", "docs/api"]);
  assert.deepEqual(openDirs(expanded), ["", "src", "src/lib"]);
});

test("pruning a folder forgets it and everything under it, not its siblings", () => {
  const expanded = new Set(["src", "src/lib", "srcx", "docs"]);
  pruneExpanded(expanded, "src");
  assert.deepEqual([...expanded].sort(), ["docs", "srcx"]);
});

test("the panel width stays within bounds and survives junk input", () => {
  assert.equal(clampPanelWidth(50), 160);
  assert.equal(clampPanelWidth(5000), 600);
  assert.equal(clampPanelWidth(301.6), 302);
  assert.equal(clampPanelWidth("nope"), 260);
});

test("the header names the root folder, even with a trailing slash", () => {
  assert.equal(baseName("/Users/me/panea"), "panea");
  assert.equal(baseName("/Users/me/panea/"), "panea");
  assert.equal(baseName("/"), "/");
});
