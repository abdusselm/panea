import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readFileAsset } from "../server/file-asset.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function tmpDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-asset-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}

test("an image inside the project comes back as base64 with its mime type", async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, "img"));
  fs.writeFileSync(path.join(dir, "img", "shot.PNG"), PNG);
  const res = await readFileAsset({ root: dir, path: "img/shot.PNG" });
  assert.equal(res.mime, "image/png");
  assert.deepEqual(Buffer.from(res.data, "base64"), PNG);
});

test("a non-image file is refused even inside the project", async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, ".env"), "SECRET=1");
  assert.deepEqual(await readFileAsset({ root: dir, path: ".env" }), { error: "not an image" });
});

test("a path or symlink that leaves the project is refused", async (t) => {
  const dir = tmpDir(t);
  const outside = tmpDir(t);
  fs.writeFileSync(path.join(outside, "x.png"), PNG);
  fs.symlinkSync(path.join(outside, "x.png"), path.join(dir, "link.png"));
  assert.equal((await readFileAsset({ root: dir, path: "../" + path.basename(outside) + "/x.png" })).error, "outside this project");
  assert.equal((await readFileAsset({ root: dir, path: "link.png" })).error, "outside this project");
  assert.equal((await readFileAsset({ root: dir, path: path.join(outside, "x.png") })).error, "outside this project");
});

test("missing input and missing files answer with an error instead of throwing", async (t) => {
  const dir = tmpDir(t);
  assert.equal((await readFileAsset({})).error, "no path");
  assert.equal((await readFileAsset({ root: dir, path: "nope.png" })).error, "not found");
  assert.equal((await readFileAsset({ root: path.join(dir, "gone"), path: "a.png" })).error, "no project");
});
