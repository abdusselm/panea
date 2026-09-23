import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bootWorkspace, activePanes, paneIds, expectPaneText, waitForSessionContaining } from "./helpers.js";

function demoRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "panea-e2e-viewer-")));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "e2e@panea.local");
  git("config", "user.name", "panea e2e");
  git("config", "commit.gpgsign", "false");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "const a = 1;\nexport function f() {\n  return a;\n}\n");
  git("add", ".");
  git("commit", "-qm", "init");
  fs.writeFileSync(path.join(dir, "src", "app.js"), "const a = 2;\nexport function f() {\n  return a;\n}\n");
  return dir;
}

async function openTreeOn(page, dir) {
  await bootWorkspace(page);
  await page.evaluate((d) => window.panea.newTab(d), dir);
  await expect(activePanes(page)).toHaveCount(1);
  await page.evaluate(() => window.panea.openFileTree());
  await page.locator('.ft-row[data-rel="src"]').click();
  return page.locator('.ft-row[data-rel="src/app.js"]');
}

test("double-clicking a file opens a highlighted viewer that marks the changed line and survives a reload", async ({ page }) => {
  const dir = demoRepo();
  try {
    const row = await openTreeOn(page, dir);
    await row.dblclick();

    const viewer = page.locator(".viewer-leaf");
    await expect(viewer).toHaveCount(1);
    await expect(viewer.locator(".vl")).toHaveCount(4);
    await expect(viewer.locator(".vl.mod")).toHaveCount(1);
    await expect(viewer.locator(".vl.mod .vl-n")).toHaveText("1");
    await expect(viewer.locator(".hljs-keyword").first()).toBeVisible();
    await expect(viewer.locator(".viewer-path")).toHaveText("src/app.js");

    await row.dblclick();
    await expect(page.locator(".viewer-leaf")).toHaveCount(1);

    await waitForSessionContaining(page, '"paneKind": "viewer"');
    await page.reload();
    await page.waitForFunction(() => !!(window.panea && window.panea.state));
    await expect(page.locator(".viewer-leaf .vl")).toHaveCount(4);
    await expect(page.locator(".viewer-leaf .viewer-path")).toHaveText("src/app.js");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("alt-double-click still types the file's path into the terminal", async ({ page }) => {
  const dir = demoRepo();
  try {
    const row = await openTreeOn(page, dir);
    const [term] = await paneIds(page);
    await row.dblclick({ modifiers: ["Alt"] });
    await expectPaneText(page, term, "src/app.js");
    await expect(page.locator(".viewer-leaf")).toHaveCount(0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
