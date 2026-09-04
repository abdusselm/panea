import test from "node:test";
import assert from "node:assert/strict";

const { mdToHtml } = await import("../public/js/markdown.js");

test("headings become h1-h6, sized by the number of hashes", () => {
  assert.equal(mdToHtml("# Title"), "<h1>Title</h1>");
  assert.equal(mdToHtml("### Sub"), "<h3>Sub</h3>");
});

test("markup in the source is escaped, never rendered", () => {
  assert.match(mdToHtml("<script>alert(1)</script>"), /&lt;script&gt;/);
});

test("bold, italic and inline code render as their tags", () => {
  assert.match(mdToHtml("**bold**"), /<strong>bold<\/strong>/);
  assert.match(mdToHtml("*italic*"), /<em>italic<\/em>/);
  assert.match(mdToHtml("`code`"), /<code>code<\/code>/);
});

test("a fenced code block is preserved verbatim, not run through inline formatting", () => {
  const html = mdToHtml("```js\nconst x = 1 * 2;\n```");
  assert.match(html, /<pre class="md-code"><code data-lang="js">const x = 1 \* 2;<\/code><\/pre>/);
});

test("a bullet list becomes a ul of li, an ordered list becomes an ol", () => {
  assert.equal(mdToHtml("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(mdToHtml("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
});

test("a link only survives with an http(s)/mailto/# scheme; anything else is neutered", () => {
  assert.match(mdToHtml("[go](https://example.com)"), /href="https:\/\/example\.com"/);
  assert.match(mdToHtml('[x](javascript:alert(1))'), /href="#"/);
});

test("plain text becomes a paragraph", () => {
  assert.equal(mdToHtml("hello world"), "<p>hello world</p>");
});

test("a blank line separates two paragraphs", () => {
  assert.equal(mdToHtml("a\n\nb"), "<p>a</p>\n<p>b</p>");
});

test("a horizontal rule line becomes hr", () => {
  assert.equal(mdToHtml("---"), "<hr>");
});

test("empty input renders as nothing", () => {
  assert.equal(mdToHtml(""), "");
  assert.equal(mdToHtml(undefined), "");
});
