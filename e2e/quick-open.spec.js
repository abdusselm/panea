import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bootWorkspace, activePanes, paneIds } from "./helpers.js";

function demoRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "panea-e2e-qo-")));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "e2e@panea.local");
  git("config", "user.name", "panea e2e");
  git("config", "commit.gpgsign", "false");
  const files = {
    "server/git.js": "a\n",
    "server/git-watch.js": "one\ntwo\nthree\n",
    "public/js/app.js": "x\ny\nz\n",
    "README.md": "# r\n",
  };
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  git("add", ".");
  git("commit", "-qm", "init");
  return dir;
}

async function openOn(page, dir) {
  await bootWorkspace(page);
  await page.evaluate((d) => window.panea.newTab(d), dir);
  await expect(activePanes(page)).toHaveCount(1);
  const [term] = await paneIds(page);
  await page.locator(`.leaf[data-pane-id="${term}"] .xterm-helper-textarea`).focus();
  return term;
}

test("Cmd+P finds a file by a fuzzy query and opens it in the viewer", async ({ page }) => {
  const dir = demoRepo();
  try {
    await openOn(page, dir);
    await page.keyboard.press("Meta+p");
    const box = page.locator("#quick-open.open");
    await expect(box).toBeVisible();
    await expect(box.locator(".qo-status")).toContainText("4 files");

    await box.locator(".palette-input").fill("gitw");
    await expect(box.locator(".qo-item").first()).toContainText("git-watch.js");
    await page.keyboard.press("Enter");

    await expect(box).toHaveCount(0);
    await expect(page.locator(".viewer-leaf .viewer-path")).toHaveText("server/git-watch.js");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a :line suffix jumps to that line, and the last file opened is offered first", async ({ page }) => {
  const dir = demoRepo();
  try {
    await openOn(page, dir);
    await page.keyboard.press("Meta+p");
    await page.locator("#quick-open .palette-input").fill("app.js:2");
    await page.keyboard.press("Enter");
    await expect(page.locator(".viewer-leaf .viewer-path")).toHaveText("public/js/app.js");
    await expect(page.locator(".viewer-leaf .vl.hl .vl-n")).toHaveText("2");

    await page.keyboard.press("Meta+p");
    await expect(page.locator("#quick-open .qo-item").first()).toContainText("app.js");
    await page.keyboard.press("Escape");
    await expect(page.locator("#quick-open.open")).toHaveCount(0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
