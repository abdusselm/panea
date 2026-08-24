import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isNewer, detectInstall } from "../server/update.js";

test("compares released versions", () => {
  assert.equal(isNewer("0.2.0", "0.1.0"), true);
  assert.equal(isNewer("0.1.1", "0.1.0"), true);
  assert.equal(isNewer("1.0.0", "0.9.9"), true);
  assert.equal(isNewer("0.1.0", "0.1.0"), false);
  assert.equal(isNewer("0.1.0", "0.2.0"), false);
  assert.equal(isNewer("0.9.9", "1.0.0"), false);
});

test("accepts a leading v, since release tags carry one", () => {
  assert.equal(isNewer("v0.2.0", "0.1.0"), true);
  assert.equal(isNewer("v0.1.0", "0.1.0"), false);
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

test("tells a Homebrew install from an npm one, and ignores anything else", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "panea-test-"));

  const npmInstall = path.join(tmp, "node_modules", "panea");
  fs.mkdirSync(npmInstall, { recursive: true });
  assert.equal(detectInstall(npmInstall), "npm");

  const brewInstall = path.join(tmp, "Cellar", "panea", "0.1.0", "libexec", "lib", "node_modules", "panea");
  fs.mkdirSync(brewInstall, { recursive: true });
  assert.equal(detectInstall(brewInstall), "homebrew");

  const elsewhere = path.join(tmp, "somewhere", "panea");
  fs.mkdirSync(elsewhere, { recursive: true });
  assert.equal(detectInstall(elsewhere), null);

  fs.mkdirSync(path.join(npmInstall, ".git"));
  assert.equal(detectInstall(npmInstall), null);

  fs.rmSync(tmp, { recursive: true, force: true });
});
