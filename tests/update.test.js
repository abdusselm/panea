import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isNewer, detectInstall, relaunchCommand, highestVersion } from "../server/update.js";

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

test("reads the newest keg when brew keeps several installed", () => {
  assert.equal(highestVersion(["0.2.1", "0.4.0", "0.3.0"]), "0.4.0");
  assert.equal(highestVersion(["0.1.4"]), "0.1.4");
});

test("skips keg names brew prints that are not versions", () => {
  assert.equal(highestVersion(["HEAD-a1b2c3", "0.1.4"]), "0.1.4");
  assert.equal(highestVersion([]), null);
});

test("a stale tap leaves the installed version behind the release", () => {
  assert.equal(isNewer("0.4.0", highestVersion(["0.2.1"])), true);
  assert.equal(isNewer("0.4.0", highestVersion(["0.2.1", "0.4.0"])), false);
});

test("restarts through the linked binary, which follows the upgrade", () => {
  const linked = "/opt/homebrew/opt/panea/bin/panea";
  const relaunch = relaunchCommand({
    name: "panea",
    argv: ["--app"],
    prefix: "/opt/homebrew/opt/panea",
    entry: "/opt/homebrew/Cellar/panea/0.1.4/libexec/bin/panea",
    exists: (target) => target === linked,
  });
  assert.deepEqual(relaunch, { command: linked, args: ["--app"] });
});

test("never restarts the keg it just upgraded away from", () => {
  const gone = "/opt/homebrew/Cellar/panea/0.1.4/libexec/bin/panea";
  const relaunch = relaunchCommand({
    name: "panea",
    argv: ["--app"],
    prefix: "/opt/homebrew/opt/panea",
    entry: gone,
    exists: () => false,
  });
  assert.equal(relaunch, null);
});

test("falls back to the running entry point when brew reports no prefix", () => {
  const entry = "/somewhere/bin/panea";
  const relaunch = relaunchCommand({
    name: "panea",
    argv: [],
    prefix: null,
    entry,
    exists: (target) => target === entry,
  });
  assert.deepEqual(relaunch, { command: process.execPath, args: [entry] });
});

test("only a Homebrew keg self-updates", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "panea-test-"));

  const brewInstall = path.join(tmp, "Cellar", "panea", "0.1.0", "libexec", "lib", "node_modules", "panea");
  fs.mkdirSync(brewInstall, { recursive: true });
  assert.equal(detectInstall(brewInstall), "homebrew");

  const nodeModules = path.join(tmp, "node_modules", "panea");
  fs.mkdirSync(nodeModules, { recursive: true });
  assert.equal(detectInstall(nodeModules), null);

  const elsewhere = path.join(tmp, "somewhere", "panea");
  fs.mkdirSync(elsewhere, { recursive: true });
  assert.equal(detectInstall(elsewhere), null);

  fs.mkdirSync(path.join(brewInstall, ".git"));
  assert.equal(detectInstall(brewInstall), null);

  fs.rmSync(tmp, { recursive: true, force: true });
});
