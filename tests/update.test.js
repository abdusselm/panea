import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isNewer, isManagedInstall } from "../server/update.js";

test("compares released versions", () => {
  assert.equal(isNewer("0.2.0", "0.1.0"), true);
  assert.equal(isNewer("0.1.1", "0.1.0"), true);
  assert.equal(isNewer("1.0.0", "0.9.9"), true);
  assert.equal(isNewer("0.1.0", "0.1.0"), false);
  assert.equal(isNewer("0.1.0", "0.2.0"), false);
  assert.equal(isNewer("0.9.9", "1.0.0"), false);
});

test("compares numerically, not as strings", () => {
  assert.equal(isNewer("0.10.0", "0.9.0"), true);
  assert.equal(isNewer("0.9.0", "0.10.0"), false);
});

test("never treats a prerelease as an upgrade over a release", () => {
  assert.equal(isNewer("0.2.0-beta.1", "0.1.0"), false);
  assert.equal(isNewer("0.2.0", "0.2.0-beta.1"), true);
});

test("ignores unparseable versions", () => {
  assert.equal(isNewer("latest", "0.1.0"), false);
  assert.equal(isNewer("0.2.0", "not-a-version"), false);
  assert.equal(isNewer("", "0.1.0"), false);
});

test("only a node_modules/panea checkout counts as a managed install", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "panea-test-"));

  const managed = path.join(tmp, "node_modules", "panea");
  fs.mkdirSync(managed, { recursive: true });
  assert.equal(isManagedInstall(managed), true);

  const elsewhere = path.join(tmp, "somewhere", "panea");
  fs.mkdirSync(elsewhere, { recursive: true });
  assert.equal(isManagedInstall(elsewhere), false);

  fs.mkdirSync(path.join(managed, ".git"));
  assert.equal(isManagedInstall(managed), false);

  fs.rmSync(tmp, { recursive: true, force: true });
});
