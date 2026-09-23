import test from "node:test";
import assert from "node:assert/strict";

import { findFileLinks, findFileLinksAcrossRows, isMarkdownPath } from "../public/js/file-links.js";

const texts = (line) => findFileLinks(line).map((l) => l.text);

test("a bare markdown filename becomes a link spanning exactly its own text", () => {
  const [link] = findFileLinks("Markdown dosyasini olusturdum: version-history-report.md");
  assert.equal(link.text, "version-history-report.md");
  const start = "Markdown dosyasini olusturdum: ".length;
  assert.equal(link.startCol, start + 1);
  assert.equal(link.endCol, start + link.text.length);
});

test("a path with a line and column keeps them apart from the path", () => {
  const [link] = findFileLinks("Updated server/git.js:42:7 to use the root");
  assert.deepEqual([link.text, link.path, link.line, link.col], ["server/git.js:42:7", "server/git.js", 42, 7]);
  const [plain] = findFileLinks("see public/js/file-tree.js:118.");
  assert.deepEqual([plain.path, plain.line, plain.col], ["public/js/file-tree.js", 118, 0]);
});

test("relative, dotted, home and absolute paths are all links", () => {
  assert.deepEqual(texts("edit ./a/b.ts ../c.py ~/notes/todo.txt /etc/hosts"), [
    "./a/b.ts", "../c.py", "~/notes/todo.txt", "/etc/hosts",
  ]);
  assert.deepEqual(texts("in src/Makefile"), []);
  assert.deepEqual(texts("in ./scripts/run"), ["./scripts/run"]);
});

test("sentence punctuation after a path is not part of it", () => {
  assert.deepEqual(texts("I changed README.md. Then tests/a.test.js, too."), ["README.md", "tests/a.test.js"]);
});

test("urls, versions, prose abbreviations and slashed words are not files", () => {
  assert.deepEqual(texts("https://github.com/abdusselm/panea/blob/main/a.js"), []);
  assert.deepEqual(texts("bumped to v1.2.3 and 0.4.21"), []);
  assert.deepEqual(texts("e.g. this, i.e. that"), []);
  assert.deepEqual(texts("read/write and TCP/IP"), []);
  assert.deepEqual(texts("mail me@example.com"), []);
});

test("multiple files on one line each get their own link, in order", () => {
  const links = findFileLinks("wrote a.md and src/b.js");
  assert.deepEqual(links.map((l) => l.text), ["a.md", "src/b.js"]);
  assert.ok(links[0].endCol < links[1].startCol);
});

test("markdown is told apart from look-alike extensions", () => {
  assert.equal(isMarkdownPath("docs/CHANGELOG.md"), true);
  assert.equal(isMarkdownPath("page.mdx"), false);
  assert.deepEqual(texts("see something.mdx"), ["something.mdx"]);
});

test("a single unwrapped row behaves exactly like findFileLinks", () => {
  const rows = ["see docs/CHANGELOG.md for details"];
  assert.deepEqual(findFileLinksAcrossRows(rows, 0), findFileLinks(rows[0]));
});

test("a path split across a soft-wrapped terminal row is joined before matching", () => {
  const rows = ["created /private/tmp/scrat", "chpad/boilerplate.md just now"];
  const [link] = findFileLinksAcrossRows(rows, 1);
  assert.equal(link.path, "/private/tmp/scratchpad/boilerplate.md");
  assert.equal(link.startCol, 1);
  assert.equal(link.endCol, "chpad/boilerplate.md".length);
});

test("querying the row before the wrap clips the link to that row", () => {
  const rows = ["created /private/tmp/scrat", "chpad/boilerplate.md just now"];
  const [link] = findFileLinksAcrossRows(rows, 0);
  assert.equal(link.path, "/private/tmp/scratchpad/boilerplate.md");
  assert.equal(link.startCol, "created ".length + 1);
  assert.equal(link.endCol, rows[0].length);
});

test("a link entirely on a later row is not reported for an earlier row", () => {
  const rows = ["nothing file-like here", "but b.md is over here"];
  assert.deepEqual(findFileLinksAcrossRows(rows, 0), []);
});
