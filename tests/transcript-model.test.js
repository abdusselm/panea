import test from "node:test";
import assert from "node:assert/strict";

const { splitSections } = await import("../public/js/transcript-model.js");

function fromLines(lines, marks) {
  return splitSections({ lineCount: lines.length, marks, lineText: (i) => lines[i] });
}

test("what you asked splits the conversation, one section per exchange", () => {
  const lines = [
    "⏺ warming up",
    "> bu nasil oluyor",
    "⏺ soyle oluyor",
    "  detay",
    "> peki ya X",
    "⏺ X sudur",
  ];
  const sections = fromLines(lines, [
    { line: 1, text: "bu nasil oluyor" },
    { line: 4, text: "peki ya X" },
  ]);

  assert.deepEqual(sections.map((s) => s.title), ["earlier output", "bu nasil oluyor", "peki ya X"]);
  assert.deepEqual(sections.map((s) => [s.start, s.end]), [[0, 0], [1, 3], [4, 5]]);
  assert.deepEqual(sections.map((s) => s.lines), [1, 3, 2]);
});

test("output that came before the first question is kept, not dropped", () => {
  const sections = fromLines(
    ["old output", "more old", "> first question", "answer"],
    [{ line: 2, text: "first question" }, { line: 3, text: "second" }],
  );
  assert.equal(sections[0].start, 0, "the transcript must start at the first line");
  assert.equal(sections[0].title, "earlier output");
});

test("a scrollback panea never watched still folds, on the agent's own turn markers", () => {
  const sections = fromLines(
    ["⏺ Bash(ls)", "  ⎿ a.txt", "⏺ Read(file)", "  ⎿ done", "❯ echo hi", "hi"],
    [],
  );
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map((s) => s.start), [0, 2, 4]);
  assert.equal(sections[0].title, "Bash(ls)", "the turn glyph must not survive into the title");
});

test("a single question is not enough to trust the marks", () => {
  const sections = fromLines(
    ["⏺ one", "> only question", "⏺ two"],
    [{ line: 1, text: "only question" }],
  );
  assert.ok(sections.length >= 2, "falls back to turn markers rather than making one blob");
  assert.ok(!sections.some((s) => s.title === "only question"));
});

test("plain output with no structure at all stays one section", () => {
  const sections = fromLines(["hello", "world"], []);
  assert.deepEqual(sections, [{ start: 0, end: 1, lines: 2, title: "hello" }]);
});

test("a long question is trimmed so a header stays one line", () => {
  const long = "x".repeat(200);
  const sections = fromLines(["a", "b", "c"], [{ line: 0, text: long }, { line: 2, text: "next" }]);
  assert.ok(sections[0].title.length <= 90);
  assert.ok(sections[0].title.endsWith("…"));
});

test("marks pointing past the end of the scrollback are ignored", () => {
  const sections = fromLines(["⏺ a", "b"], [{ line: 0, text: "kept" }, { line: 99, text: "gone" }]);
  assert.ok(!sections.some((s) => s.title === "gone"));
  assert.equal(sections[sections.length - 1].end, 1, "sections must stay inside the buffer");
});

test("questions arriving out of order are put back in reading order", () => {
  const sections = fromLines(
    ["a", "b", "c", "d"],
    [{ line: 2, text: "second" }, { line: 0, text: "first" }],
  );
  assert.deepEqual(sections.map((s) => s.title), ["first", "second"]);
});
