import test from "node:test";
import assert from "node:assert/strict";

import {
  parseQuery, prepare, scorePath, rankFiles, splitHighlight, pushRecent, baseStart,
} from "../public/js/quick-open-model.js";

const FILES = [
  "server/git.js",
  "server/git-commit.js",
  "server/git-watch.js",
  "public/js/git.js",
  "public/js/file-view.js",
  "public/js/file-view-model.js",
  "tests/file-view.test.js",
  "README.md",
  "public/css/file-view.css",
  "docs/guide/getting-started.md",
];

const top = (q, opts) => rankFiles(prepare(FILES), q, opts).map((r) => r.path);

test("a trailing line and column are split off the query", () => {
  assert.deepEqual(parseQuery("git.js:42"), { text: "git.js", line: 42, col: 0 });
  assert.deepEqual(parseQuery(" server/git.js:42:7 "), { text: "server/git.js", line: 42, col: 7 });
  assert.deepEqual(parseQuery("file view"), { text: "fileview", line: 0, col: 0 });
  assert.deepEqual(parseQuery(":12"), { text: ":12", line: 0, col: 0 });
});

test("an exact file name wins over a longer name that merely contains it", () => {
  assert.deepEqual(top("git.js").slice(0, 2).sort(), ["public/js/git.js", "server/git.js"]);
  assert.ok(top("git.js").indexOf("server/git-commit.js") > 1);
});

test("a match inside the file name beats one scattered across folders", () => {
  assert.match(top("fv")[0], /\/file-view[.-]/);
  assert.equal(top("readme")[0], "README.md");
});

test("a slash in the query matches against the whole path", () => {
  assert.equal(top("css/fv")[0], "public/css/file-view.css");
  assert.equal(top("server/git")[0], "server/git.js");
});

test("word starts count: an initialism finds the file", () => {
  assert.equal(top("gs")[0], "docs/guide/getting-started.md");
  assert.equal(top("fvm")[0], "public/js/file-view-model.js");
});

test("characters that do not appear in order give no match", () => {
  assert.deepEqual(top("zzz"), []);
  assert.equal(scorePath("abc", "abc", 0, "cba"), null);
});

test("matching is case-insensitive and reports the matched positions", () => {
  const p = "server/Git.js";
  const r = scorePath(p, p.toLowerCase(), baseStart(p), "git");
  assert.deepEqual(r.positions, [7, 8, 9]);
});

test("an empty query lists recent files first, then the rest, within the limit", () => {
  assert.deepEqual(top("", { recent: ["README.md", "gone.js", "server/git.js"], limit: 4 }), [
    "README.md", "server/git.js", "server/git-commit.js", "server/git-watch.js",
  ]);
});

test("a recently opened file breaks a tie in its favour", () => {
  assert.equal(top("git.js", { recent: ["server/git.js"] })[0], "server/git.js");
  assert.equal(top("git.js", { recent: ["public/js/git.js"] })[0], "public/js/git.js");
});

test("highlight parts cover the text exactly once, merging runs", () => {
  assert.deepEqual(splitHighlight("git.js", [7, 8, 9], 7), [{ text: "git", match: true }, { text: ".js", match: false }]);
  assert.deepEqual(splitHighlight("server/", [0, 7], 0), [{ text: "s", match: true }, { text: "erver/", match: false }]);
  assert.deepEqual(splitHighlight("abc", []), [{ text: "abc", match: false }]);
});

test("recent files move to the front without duplicates and stay bounded", () => {
  assert.deepEqual(pushRecent(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(pushRecent(["a", "b"], "c", 2), ["c", "a"]);
});
