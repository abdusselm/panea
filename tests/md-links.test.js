import test from "node:test";
import assert from "node:assert/strict";

const { findMdLinks, findMdLinksAcrossRows } = await import("../public/js/md-links.js");

test("a bare markdown filename becomes a link spanning exactly its own text", () => {
  const [link] = findMdLinks("Markdown dosyasini olusturdum: version-history-report.md");
  assert.equal(link.text, "version-history-report.md");
  const start = "Markdown dosyasini olusturdum: ".length;
  assert.equal(link.startCol, start + 1);
  assert.equal(link.endCol, start + link.text.length);
});

test("a relative path keeps its directory in the link text", () => {
  const [link] = findMdLinks("see docs/CHANGELOG.md for details");
  assert.equal(link.text, "docs/CHANGELOG.md");
});

test("multiple filenames on one line each get their own link, in order", () => {
  const links = findMdLinks("wrote a.md and b.md");
  assert.deepEqual(links.map((l) => l.text), ["a.md", "b.md"]);
  assert.ok(links[0].endCol < links[1].startCol);
});

test("a line with nothing markdown-shaped produces no links", () => {
  assert.deepEqual(findMdLinks("no markdown files mentioned here"), []);
});

test("something.mdx is not mistaken for a .md file", () => {
  assert.deepEqual(findMdLinks("see something.mdx"), []);
});

test("a single-character stem still matches", () => {
  const [link] = findMdLinks("open a.md");
  assert.equal(link.text, "a.md");
});

test("a single unwrapped row behaves exactly like findMdLinks", () => {
  const rows = ["see docs/CHANGELOG.md for details"];
  assert.deepEqual(findMdLinksAcrossRows(rows, 0), findMdLinks(rows[0]));
});

test("a path split across a soft-wrapped terminal row is joined before matching", () => {
  const rows = ["created /private/tmp/scrat", "chpad/boilerplate.md just now"];
  const [link] = findMdLinksAcrossRows(rows, 1);
  assert.equal(link.text, "private/tmp/scratchpad/boilerplate.md");
});

test("the clipped range for a wrapped link stays within the queried row", () => {
  const rows = ["created /private/tmp/scrat", "chpad/boilerplate.md just now"];
  const [link] = findMdLinksAcrossRows(rows, 1);
  assert.ok(link.startCol >= 1 && link.endCol <= rows[1].length);
});

test("querying the row before the wrap still resolves the full path", () => {
  const rows = ["created /private/tmp/scrat", "chpad/boilerplate.md just now"];
  const [link] = findMdLinksAcrossRows(rows, 0);
  assert.equal(link.text, "private/tmp/scratchpad/boilerplate.md");
  assert.ok(link.endCol <= rows[0].length);
});

test("a link entirely on a later row is not reported for an earlier row", () => {
  const rows = ["nothing markdown here", "but b.md is over here"];
  assert.deepEqual(findMdLinksAcrossRows(rows, 0), []);
});
