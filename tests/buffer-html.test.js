import test from "node:test";
import assert from "node:assert/strict";

const { lineToHtml, escapeHtml } = await import("../public/js/buffer-html.js");

const ANSI = ["#111", "#c66", "#b5b", "#fc7", "#81a", "#b29", "#8ab", "#c5c",
  "#666", "#d54", "#b9c", "#e7c", "#7aa", "#c39", "#70c", "#eae"];
ANSI.background = "#282c34";
ANSI.foreground = "#ededed";

function cell(chars, style = {}) {
  return {
    getChars: () => chars,
    getWidth: () => (style.width === undefined ? 1 : style.width),
    getFgColor: () => style.fg ?? 0,
    getBgColor: () => style.bg ?? 0,
    isFgDefault: () => style.fgKind === undefined,
    isBgDefault: () => style.bgKind === undefined,
    isFgPalette: () => style.fgKind === "palette",
    isBgPalette: () => style.bgKind === "palette",
    isFgRGB: () => style.fgKind === "rgb",
    isBgRGB: () => style.bgKind === "rgb",
    isBold: () => (style.bold ? 1 : 0),
    isItalic: () => (style.italic ? 1 : 0),
    isDim: () => (style.dim ? 1 : 0),
    isUnderline: () => (style.underline ? 1 : 0),
    isStrikethrough: () => 0,
    isInverse: () => (style.inverse ? 1 : 0),
    isInvisible: () => 0,
  };
}

function line(cells) {
  return { length: cells.length, getCell: (x) => cells[x] || null };
}

function text(cells) {
  return line(cells.split("").map((c) => cell(c)));
}

test("plain output survives the trip to HTML unchanged", () => {
  assert.equal(lineToHtml(text("hello")), "hello");
});

test("markup in the terminal is escaped, never rendered", () => {
  assert.equal(lineToHtml(text("<b>&")), "&lt;b&gt;&amp;");
  assert.equal(escapeHtml('<script>"x"'), '&lt;script&gt;"x"');
});

test("a run of one colour becomes one span, not one per character", () => {
  const red = { fgKind: "palette", fg: 1 };
  const html = lineToHtml(line([cell("a", red), cell("b", red), cell("c", red)]), ANSI);
  assert.equal(html, '<span style="color:#c66;">abc</span>');
});

test("colour changes split the runs where the colour changes", () => {
  const html = lineToHtml(
    line([cell("a", { fgKind: "palette", fg: 1 }), cell("b", { fgKind: "palette", fg: 2 })]),
    ANSI,
  );
  assert.equal(html, '<span style="color:#c66;">a</span><span style="color:#b5b;">b</span>');
});

test("the 256-colour cube and greyscale ramp are computed, not guessed", () => {
  assert.match(lineToHtml(line([cell("x", { fgKind: "palette", fg: 196 })]), ANSI), /rgb\(255,0,0\)/);
  assert.match(lineToHtml(line([cell("x", { fgKind: "palette", fg: 244 })]), ANSI), /rgb\(128,128,128\)/);
});

test("true-colour cells keep their exact colour", () => {
  const html = lineToHtml(line([cell("x", { fgKind: "rgb", fg: 0x2f6feb })]), ANSI);
  assert.match(html, /color:#2f6feb;/);
});

test("bold, italic and underline survive as styling, not as escape codes", () => {
  const html = lineToHtml(line([cell("x", { bold: true, italic: true, underline: true })]), ANSI);
  assert.match(html, /font-weight:600;/);
  assert.match(html, /font-style:italic;/);
  assert.match(html, /text-decoration:underline;/);
});

test("inverse video swaps the two colours instead of losing one", () => {
  const html = lineToHtml(
    line([cell("x", { inverse: true, fgKind: "palette", fg: 1, bgKind: "palette", bg: 4 })]),
    ANSI,
  );
  assert.match(html, /color:#81a;/);
  assert.match(html, /background:#c66;/);
});

test("padding at the end of a line is dropped so blocks do not sprawl", () => {
  assert.equal(lineToHtml(text("hi   ")), "hi");
  assert.equal(lineToHtml(text("     ")), "");
});

test("the trailing half of a wide character is not written twice", () => {
  const html = lineToHtml(line([cell("字", { width: 2 }), cell("", { width: 0 }), cell("x")]));
  assert.equal(html, "字x");
});

test("a line the terminal cannot give us renders as nothing", () => {
  assert.equal(lineToHtml(null), "");
  assert.equal(lineToHtml({}), "");
});

function wrapped(cells, isWrapped) {
  const l = line(cells.split("").map((c) => cell(c)));
  l.isWrapped = !!isWrapped;
  return l;
}

const { linesToHtml } = await import("../public/js/buffer-html.js");

test("a line the terminal wrapped is put back together, not shown as two", () => {
  const rows = [wrapped("abc"), wrapped("def", true), wrapped("ghi")];
  assert.equal(linesToHtml((i) => rows[i], 0, 2), "abcdef\nghi");
});

test("blank rows inside a block are kept, trailing ones are not", () => {
  const rows = [wrapped("a"), wrapped("   "), wrapped("b"), wrapped("   "), wrapped("   ")];
  assert.equal(linesToHtml((i) => rows[i], 0, 4), "a\n\nb");
});

test("a block of nothing renders as nothing", () => {
  const rows = [wrapped("  "), wrapped("  ")];
  assert.equal(linesToHtml((i) => rows[i], 0, 1), "");
  assert.equal(linesToHtml(null, 0, 1), "");
});
