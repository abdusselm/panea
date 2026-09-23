import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "panea-settings-"));
process.env.PANEA_STATE_DIR = dir;
const { loadSettings, saveSettings } = await import("../server/settings-store.js");
const file = path.join(dir, "settings.json");

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("with no file, tips are on and nothing is learned yet", () => {
  assert.deepEqual(loadSettings(), { shortcuts: {}, tips: { enabled: true, retired: [], shown: {} } });
});

test("saving shortcuts keeps the stored tips, and saving tips keeps the shortcuts", () => {
  saveSettings({ tips: { enabled: false, retired: ["git-diff"], shown: { files: 2 } } });
  saveSettings({ shortcuts: { "git-diff": "Cmd-Shift-G" } });
  assert.deepEqual(loadSettings(), {
    shortcuts: { "git-diff": "Cmd-Shift-G" },
    tips: { enabled: false, retired: ["git-diff"], shown: { files: 2 } },
  });
  saveSettings({ tips: { enabled: true, retired: [], shown: {} } });
  assert.deepEqual(loadSettings().shortcuts, { "git-diff": "Cmd-Shift-G" });
});

test("junk in the tips section is dropped", () => {
  const saved = saveSettings({ tips: {
    enabled: "yes",
    retired: ["ok-id", "Bad Id", 3, "ok-id", "x".repeat(41)],
    shown: { "ok-id": 2.5, find: 4, files: -1, split: 500 },
  } });
  assert.deepEqual(saved.tips, { enabled: true, retired: ["ok-id"], shown: { find: 4, split: 99 } });
});

test("a hand-broken file falls back to defaults instead of throwing", () => {
  fs.writeFileSync(file, "{ not json");
  assert.deepEqual(loadSettings().tips, { enabled: true, retired: [], shown: {} });
});
