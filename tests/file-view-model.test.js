import test from "node:test";
import assert from "node:assert/strict";

import {
  languageFor, textLines, splitHighlighted, plainHtmlLines, lineMarkMap, findMatches, clampLine, MAX_MATCHES,
} from "../public/js/file-view-model.js";

test("the language comes from the extension or a well-known file name", () => {
  assert.equal(languageFor("src/app.ts"), "typescript");
  assert.equal(languageFor("server/git.js"), "javascript");
  assert.equal(languageFor("Makefile"), "makefile");
  assert.equal(languageFor("home/.zshrc"), "bash");
  assert.equal(languageFor("styles/Theme.SCSS"), "scss");
  assert.equal(languageFor("LICENSE"), "");
  assert.equal(languageFor("archive.xyz"), "");
  assert.equal(languageFor(".env"), "");
});

test("text splits into lines without inventing a last empty one", () => {
  assert.deepEqual(textLines("a\nb\n"), ["a", "b"]);
  assert.deepEqual(textLines("a\r\nb"), ["a", "b"]);
  assert.deepEqual(textLines("a\n\n"), ["a", ""]);
  assert.deepEqual(textLines(""), [""]);
});

test("a highlighted span that crosses a newline is closed and reopened", () => {
  const html = 'x = <span class="s">`a\nb`</span>;\n<span class="c">/* c\nd */</span>\n';
  assert.deepEqual(splitHighlighted(html, "x = `a\nb`;\n/* c\nd */\n"), [
    'x = <span class="s">`a</span>',
    '<span class="s">b`</span>;',
    '<span class="c">/* c</span>',
    '<span class="c">d */</span>',
  ]);
});

test("nested spans survive a line break in the right order", () => {
  const html = '<span class="a">1<span class="b">2\n3</span>4</span>';
  assert.deepEqual(splitHighlighted(html, "12\n34"), [
    '<span class="a">1<span class="b">2</span></span>',
    '<span class="a"><span class="b">3</span>4</span>',
  ]);
});

test("highlighted and plain rendering agree on the line count", () => {
  const content = "one\ntwo\n\nfour\n";
  const html = content.replace(/two/, '<span class="k">two</span>');
  assert.equal(splitHighlighted(html, content).length, textLines(content).length);
  assert.deepEqual(plainHtmlLines("<a> & b\n"), ["&lt;a&gt; &amp; b"]);
});

test("git marks turn into per-line kinds and deletion edges", () => {
  const { kinds, dels } = lineMarkMap([
    { start: 2, count: 1, kind: "mod" },
    { start: 4, count: 2, kind: "add" },
    { start: 7, count: 0, kind: "del" },
    { start: 99, count: 0, kind: "del" },
  ], false, 8);
  assert.deepEqual([...kinds], [[2, "mod"], [4, "add"], [5, "add"]]);
  assert.deepEqual([...dels], [[7, "above"], [8, "below"]]);
});

test("a new file marks every line as added, and marks never run past the end", () => {
  assert.equal(lineMarkMap([], true, 3).kinds.size, 3);
  assert.deepEqual([...lineMarkMap([{ start: 2, count: 10, kind: "add" }], false, 3).kinds.keys()], [2, 3]);
  assert.equal(lineMarkMap([{ start: 1, count: 1, kind: "mod" }], false, 0).kinds.size, 0);
});

test("find is case-insensitive, reports every hit, and is capped", () => {
  assert.deepEqual(findMatches(["Foo foo", "bar", "xFOOx"], "foo"), [
    { line: 1, start: 0, end: 3 },
    { line: 1, start: 4, end: 7 },
    { line: 3, start: 1, end: 4 },
  ]);
  assert.deepEqual(findMatches(["abc"], ""), []);
  assert.equal(findMatches([ "a".repeat(MAX_MATCHES + 10) ], "a").length, MAX_MATCHES);
});

test("a requested line is clamped into the file", () => {
  assert.equal(clampLine(42, 10), 10);
  assert.equal(clampLine(3, 10), 3);
  assert.equal(clampLine(0, 10), 0);
  assert.equal(clampLine("7", 10), 7);
  assert.equal(clampLine(5, 0), 0);
});
