import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bootWorkspace, activePanes, waitForSessionContaining } from "./helpers.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const README = [
  "---",
  "name: demo",
  "---",
  "# Demo Project",
  "",
  "Intro with **bold**, a [guide](docs/guide.md) and an [anchor](#usage).",
  "",
  "<script>window.__pwned = 1</script>",
  '<img src="x" onerror="window.__pwned = 2">',
  "",
  "![logo](img/logo.png)",
  "",
  "> [!TIP]",
  "> Read this first.",
  "",
  "| a | b |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "- [x] done",
  "",
  "```js",
  "const answer = 42;",
  "```",
  "",
  ...Array.from({ length: 60 }, (_, i) => "Filler paragraph " + i + ".\n"),
  "## Usage",
  "",
  "Run it.",
  "",
].join("\n");

function demoProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "panea-e2e-md-")));
  fs.mkdirSync(path.join(dir, "docs"));
  fs.mkdirSync(path.join(dir, "img"));
  fs.writeFileSync(path.join(dir, "README.md"), README);
  fs.writeFileSync(path.join(dir, "docs", "guide.md"), "# Guide\n\nBack to [readme](../README.md).\n");
  fs.writeFileSync(path.join(dir, "img", "logo.png"), PNG);
  return dir;
}

async function openReadme(page, dir) {
  await bootWorkspace(page);
  await page.evaluate((d) => window.panea.newTab(d), dir);
  await expect(activePanes(page)).toHaveCount(1);
  await page.evaluate((d) => window.panea.openInViewer({ root: d, path: "README.md" }), dir);
  return page.locator(".viewer-leaf");
}

test("a markdown file opens formatted, sanitised, and can flip to source and back", async ({ page }) => {
  const dir = demoProject();
  try {
    const viewer = await openReadme(page, dir);
    const doc = viewer.locator(".md-doc");
    await expect(doc.locator("h1#md-demo-project")).toHaveText("Demo Project");
    await expect(doc.locator(".md-front dt")).toHaveText("name");
    await expect(doc.locator(".md-alert-tip .md-alert-title")).toHaveText("Tip");
    await expect(doc.locator(".md-table td").first()).toHaveText("1");
    await expect(doc.locator("input.md-task")).toBeChecked();
    await expect(doc.locator('pre.md-code[data-lang="js"] .hljs-keyword')).toHaveText("const");
    await expect(doc.locator('img[alt="logo"]')).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect(doc.locator("script")).toHaveCount(0);
    await expect(doc.locator("[onerror]")).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await expect(viewer.locator(".viewer-info")).toContainText("min read");
    await expect(viewer.locator(".viewer-lines")).toBeHidden();

    await viewer.locator('.viewer-mode [data-mode="source"]').click();
    await expect(viewer.locator(".md-doc")).toBeHidden();
    await expect(viewer.locator(".vl").first()).toContainText("---");
    await expect(viewer.locator(".viewer-info")).toContainText("lines");

    await viewer.locator(".viewer-body").focus();
    await page.keyboard.press("Meta+Shift+V");
    await expect(doc).toBeVisible();
    await expect(viewer.locator('.viewer-mode [data-mode="read"]')).toHaveClass(/on/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("anchor links scroll within the doc and relative links open the target file", async ({ page }) => {
  const dir = demoProject();
  try {
    const viewer = await openReadme(page, dir);
    const body = viewer.locator(".viewer-body");
    await expect(viewer.locator("h2#md-usage")).toBeAttached();
    await viewer.locator('a[href="#usage"]').click();
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);

    await viewer.locator('a[href="docs/guide.md"]').click();
    await expect(viewer.locator(".viewer-path")).toHaveText("docs/guide.md");
    await expect(viewer.locator(".md-doc h1")).toHaveText("Guide");
    await expect(page.locator(".viewer-leaf")).toHaveCount(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("source mode survives a reload; a path:line open lands in source on that line", async ({ page }) => {
  const dir = demoProject();
  try {
    const viewer = await openReadme(page, dir);
    await viewer.locator('.viewer-mode [data-mode="source"]').click();
    await waitForSessionContaining(page, '"mdSource": true');
    await page.reload();
    await page.waitForFunction(() => !!(window.panea && window.panea.state));
    await expect(page.locator(".viewer-leaf .vl").first()).toBeVisible();
    await expect(page.locator(".viewer-leaf .md-doc")).toBeHidden();

    await page.evaluate((d) => window.panea.openInViewer({ root: d, path: "docs/guide.md" }), dir);
    await expect(page.locator(".viewer-leaf .md-doc h1")).toHaveText("Guide");

    await page.evaluate((d) => window.panea.openInViewer({ root: d, path: "README.md", line: 4 }), dir);
    await expect(page.locator(".viewer-leaf .vl.hl .vl-n")).toHaveText("4");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("find works on the rendered text in preview mode", async ({ page }) => {
  const dir = demoProject();
  try {
    const viewer = await openReadme(page, dir);
    await expect(viewer.locator(".md-doc h1")).toBeVisible();
    await viewer.locator(".viewer-body").focus();
    await page.keyboard.press("Meta+F");
    await page.keyboard.type("filler paragraph 5");
    await expect(viewer.locator(".viewer-find-count")).toHaveText(/^1\/11$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
