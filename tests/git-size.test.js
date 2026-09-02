import test from "node:test";
import assert from "node:assert/strict";

const {
  MIN_BOX_W, MIN_BOX_H, MIN_FILES_W, MIN_DIFF_W,
  clampGitBox, defaultGitBox, clampFilesWidth, defaultFilesWidth,
} = await import("../public/js/git-size.js");

test("the git panel opens wide enough to read a diff without resizing it first", () => {
  const box = defaultGitBox(1512, 950);
  assert.equal(box.w, 1456);
  assert.ok(box.h > 950 * 0.8);
});

test("a size dragged past the viewport is pulled back inside it", () => {
  const box = clampGitBox({ w: 4000, h: 4000 }, 1512, 950);
  assert.ok(box.w <= 1512 - 32);
  assert.ok(box.h <= 950 - 56);
});

test("a drag that shrinks the box stops at the minimum readable size", () => {
  const box = clampGitBox({ w: 10, h: 10 }, 1512, 950);
  assert.equal(box.w, MIN_BOX_W);
  assert.equal(box.h, MIN_BOX_H);
});

test("a window smaller than the minimum box wins over the minimum", () => {
  const box = clampGitBox({ w: MIN_BOX_W, h: MIN_BOX_H }, 400, 300);
  assert.equal(box.w, 400 - 32);
  assert.equal(box.h, 300 - 56);
});

test("the file list keeps a readable diff beside it", () => {
  assert.equal(clampFilesWidth(2000, 900), 900 - MIN_DIFF_W);
  assert.equal(clampFilesWidth(10, 900), MIN_FILES_W);
});

test("a narrow box still leaves the file list its minimum", () => {
  assert.equal(clampFilesWidth(300, 300), MIN_FILES_W);
});

test("the default file column scales with the box and stays legal", () => {
  const wide = defaultFilesWidth(1456);
  assert.ok(wide >= 340);
  assert.equal(wide, clampFilesWidth(wide, 1456));
});

test("a saved size survives a re-clamp against the same viewport", () => {
  const box = clampGitBox({ w: 1100, h: 700 }, 1512, 950);
  assert.deepEqual(box, { w: 1100, h: 700 });
});
