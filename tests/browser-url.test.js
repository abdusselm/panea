import test from "node:test";
import assert from "node:assert/strict";

const { normalizeUrl, hostLabel, looksLikeHost, isLoopbackUrl, SEARCH_PREFIX } =
  await import("../public/js/browser-url.js");

test("a bare hostname becomes https", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com");
  assert.equal(normalizeUrl("  example.com/docs?a=1  "), "https://example.com/docs?a=1");
});

test("an explicit scheme is left alone", () => {
  assert.equal(normalizeUrl("http://example.com"), "http://example.com");
  assert.equal(normalizeUrl("https://example.com"), "https://example.com");
  assert.equal(normalizeUrl("file:///tmp/a.html"), "file:///tmp/a.html");
});

test("loopback hosts stay on http so a dev server is reachable", () => {
  assert.equal(normalizeUrl("localhost:5173"), "http://localhost:5173");
  assert.equal(normalizeUrl("127.0.0.1:4820/js/main.js"), "http://127.0.0.1:4820/js/main.js");
  assert.ok(isLoopbackUrl("http://localhost:3000"));
  assert.ok(!isLoopbackUrl("https://example.com"));
});

test("free text becomes a search, not a hostname guess", () => {
  assert.equal(normalizeUrl("how to fix zsh path"), SEARCH_PREFIX + encodeURIComponent("how to fix zsh path"));
  assert.equal(normalizeUrl("panea"), SEARCH_PREFIX + "panea");
});

test("script-bearing schemes are refused instead of navigated", () => {
  assert.equal(normalizeUrl("javascript:alert(1)"), "");
  assert.equal(normalizeUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(normalizeUrl("  JavaScript:alert(1)"), "");
});

test("empty input navigates nowhere", () => {
  assert.equal(normalizeUrl(""), "");
  assert.equal(normalizeUrl("   "), "");
  assert.equal(normalizeUrl(null), "");
});

test("looksLikeHost needs a dot and a plausible last label", () => {
  assert.ok(looksLikeHost("example.com"));
  assert.ok(looksLikeHost("a.b.co.uk/path"));
  assert.ok(!looksLikeHost("hello world.com"));
  assert.ok(!looksLikeHost("example"));
  assert.ok(!looksLikeHost("what.is-this"));
});

test("hostLabel names the pane after the site", () => {
  assert.equal(hostLabel("https://www.example.com/a/b?c=1"), "example.com");
  assert.equal(hostLabel("http://localhost:5173/"), "localhost:5173");
  assert.equal(hostLabel("about:blank"), "browser");
  assert.equal(hostLabel(""), "browser");
});
