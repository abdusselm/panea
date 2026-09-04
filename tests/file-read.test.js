import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readCwdFile } from "../server/file-read.js";

function tmpDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "panea-mdread-")));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}

test("a markdown file inside the pane's cwd is read back verbatim", async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, "notes.md"), "# Hello\n");
  const res = await readCwdFile(dir, "notes.md");
  assert.deepEqual(res, { ok: true, content: "# Hello\n" });
});

test("a nested relative path resolves under the cwd", async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, "docs"));
  fs.writeFileSync(path.join(dir, "docs", "CHANGELOG.md"), "content");
  const res = await readCwdFile(dir, "docs/CHANGELOG.md");
  assert.equal(res.ok, true);
  assert.equal(res.content, "content");
});

test("a path that walks out of the cwd is refused, not followed", async (t) => {
  const dir = tmpDir(t);
  const outside = tmpDir(t);
  fs.writeFileSync(path.join(outside, "secret.md"), "nope");
  const res = await readCwdFile(dir, "../" + path.basename(outside) + "/secret.md");
  assert.equal(res.ok, false);
  assert.match(res.error, /outside/);
});

test("only .md files are servable, even if they exist and are in-bounds", async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, "secrets.env"), "TOKEN=abc");
  const res = await readCwdFile(dir, "secrets.env");
  assert.equal(res.ok, false);
  assert.match(res.error, /markdown/);
});

test("a missing file answers instead of throwing", async (t) => {
  const dir = tmpDir(t);
  const res = await readCwdFile(dir, "missing.md");
  assert.equal(res.ok, false);
});

test("a directory named *.md is not treated as a file", async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, "looks-like-a-file.md"));
  const res = await readCwdFile(dir, "looks-like-a-file.md");
  assert.equal(res.ok, false);
  assert.match(res.error, /not a file/);
});

test("an oversized file is rejected rather than streamed in full", async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, "huge.md"), Buffer.alloc((1 << 20) + 1, 97));
  const res = await readCwdFile(dir, "huge.md");
  assert.equal(res.ok, false);
  assert.match(res.error, /large/);
});

test("no cwd or no path answers cleanly", async () => {
  assert.equal((await readCwdFile("", "notes.md")).ok, false);
  assert.equal((await readCwdFile("/tmp", "")).ok, false);
});
