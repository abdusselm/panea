import test from "node:test";
import assert from "node:assert/strict";
import * as lib from "marked";

const {
  renderMarkdown, isMarkdownFile, splitFrontMatter, resolveRel, linkKind, readingStats, slugify,
} = await import("../public/js/markdown.js");

const render = (src, opts) => renderMarkdown(lib, src, opts);

test("markdown files are recognised by extension, case-insensitively", () => {
  for (const f of ["README.md", "docs/a.MD", "x.markdown", "y.mdown"]) assert.ok(isMarkdownFile(f), f);
  for (const f of ["a.mdx", "a.js", "md", ""]) assert.ok(!isMarkdownFile(f), f);
});

test("headings get prefixed, de-duplicated ids so they cannot collide with app elements", () => {
  const html = render("# Sidebar\n## Sidebar\n### Çok güzel!");
  assert.match(html, /<h1 id="md-sidebar">Sidebar<\/h1>/);
  assert.match(html, /<h2 id="md-sidebar-1">Sidebar<\/h2>/);
  assert.match(html, /<h3 id="md-çok-güzel">/);
});

test("raw html is escaped unless the caller sanitises it", () => {
  assert.match(render("<script>alert(1)</script>"), /&lt;script&gt;/);
  assert.match(render("<b>x</b>", { allowHtml: true }), /<b>x<\/b>/);
});

test("links with an unsafe scheme lose the href and keep their text", () => {
  const html = render("[go](javascript:alert(1)) [ok](https://example.com) [doc](docs/a.md)");
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /go/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /href="docs\/a\.md"/);
});

test("images keep only http(s), data:image and relative sources", () => {
  assert.match(render("![a](img/x.png)"), /<img src="img\/x\.png" alt="a">/);
  assert.match(render("![b](https://x.io/b.png)"), /src="https:\/\/x\.io\/b\.png"/);
  assert.doesNotMatch(render("![c](javascript:alert(1))"), /<img/);
});

test("fenced code goes through the highlighter and keeps its language", () => {
  const html = render("```js\nconst a = 1;\n```", { highlight: (code, lang) => "<i>" + lang + "</i>" });
  assert.match(html, /<pre class="md-code" data-lang="js"><code class="hljs"><i>js<\/i><\/code><\/pre>/);
  assert.match(render("```\n<b>\n```"), /&lt;b&gt;/);
});

test("gfm tables, task lists and strikethrough render", () => {
  const html = render("| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~old~~");
  assert.match(html, /<div class="md-table"><table>/);
  assert.match(html, /<input type="checkbox" class="md-task" disabled checked> done/);
  assert.match(html, /<input type="checkbox" class="md-task" disabled> todo/);
  assert.match(html, /<del>old<\/del>/);
});

test("github alerts become titled callouts; plain quotes stay quotes", () => {
  const html = render("> [!WARNING]\n> careful **now**\n\n> plain");
  assert.match(html, /<div class="md-alert md-alert-warning"><p class="md-alert-title">Warning<\/p><p>careful <strong>now<\/strong><\/p>/);
  assert.match(html, /<blockquote>\n<p>plain<\/p>/);
});

test("flat front matter becomes a key/value card, nested yaml stays raw", () => {
  const flat = splitFrontMatter("---\nname: x\ndescription: \"a b\"\n---\n# T\n");
  assert.deepEqual(flat.front, { pairs: [["name", "x"], ["description", "a b"]] });
  assert.equal(flat.body, "# T\n");
  assert.equal(splitFrontMatter("---\na:\n  - b\n---\nx").front.raw, "a:\n  - b");
  assert.equal(splitFrontMatter("# no front\n---\n").front, null);
  assert.match(render("---\nname: x\n---\nbody"), /^<dl class="md-front"><dt>name<\/dt><dd>x<\/dd><\/dl><p>body<\/p>/);
});

test("relative links resolve against the open file and never climb above the root", () => {
  assert.equal(resolveRel("docs/guide/a.md", "../b.md#x"), "docs/b.md");
  assert.equal(resolveRel("docs/a.md", "./img/p%20q.png"), "docs/img/p q.png");
  assert.equal(resolveRel("docs/a.md", "/README.md"), "README.md");
  assert.equal(resolveRel("a.md", "../../etc/passwd"), "");
  assert.equal(resolveRel("a.md", "#top"), "");
});

test("link kinds split anchors, external urls, project files and unsafe schemes", () => {
  assert.equal(linkKind("#x"), "anchor");
  assert.equal(linkKind("https://a.b"), "external");
  assert.equal(linkKind("mailto:a@b.c"), "external");
  assert.equal(linkKind("docs/a.md"), "file");
  assert.equal(linkKind("javascript:alert(1)"), "");
  assert.equal(linkKind("//evil.com/x"), "");
  assert.equal(linkKind(""), "");
});

test("reading stats count words and round to at least one minute", () => {
  assert.deepEqual(readingStats("hello world, çok güzel"), { words: 4, minutes: 1 });
  assert.equal(readingStats("w ".repeat(1100)).minutes, 5);
  assert.equal(slugify("Hello, World!"), "hello-world");
});

test("empty input renders nothing", () => {
  assert.equal(render(""), "");
  assert.equal(render(undefined), "");
});
