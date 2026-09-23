import test from "node:test";
import assert from "node:assert/strict";

import { parseLineMarks } from "../server/git.js";

test("a one-line change without counts is a single modified line", () => {
  assert.deepEqual(parseLineMarks("@@ -3 +3 @@\n-a\n+b\n"), [{ start: 3, count: 1, kind: "mod" }]);
});

test("a hunk with no old lines is an insertion", () => {
  assert.deepEqual(parseLineMarks("@@ -4,0 +5,3 @@\n+x\n+y\n+z\n"), [{ start: 5, count: 3, kind: "add" }]);
});

test("a hunk with no new lines marks the line right below the deletion", () => {
  assert.deepEqual(parseLineMarks("@@ -7,2 +6,0 @@\n-a\n-b\n"), [{ start: 7, count: 0, kind: "del" }]);
  assert.deepEqual(parseLineMarks("@@ -1,2 +0,0 @@\n-a\n-b\n"), [{ start: 1, count: 0, kind: "del" }]);
});

test("a replacement of a different size is one modified block over the new lines", () => {
  assert.deepEqual(parseLineMarks("@@ -10,2 +10,5 @@ function f() {\n"), [{ start: 10, count: 5, kind: "mod" }]);
});

test("every hunk in a diff is read, and headers inside content are not", () => {
  const out = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+@@ -9 +9 @@\n@@ -20,0 +21,1 @@\n+z\n";
  assert.deepEqual(parseLineMarks(out), [
    { start: 1, count: 1, kind: "mod" },
    { start: 21, count: 1, kind: "add" },
  ]);
});

test("empty or missing diff output yields no marks", () => {
  assert.deepEqual(parseLineMarks(""), []);
  assert.deepEqual(parseLineMarks(undefined), []);
});
