import { test, expect } from "@playwright/test";
import { bootWorkspace, waitForSessionContaining } from "./helpers.js";

async function openGitPanel(page, { fresh = false } = {}) {
  if (fresh) await page.evaluate(() => { window.panea.runtime.gitPanel = null; });
  await page.evaluate(() => window.panea.openGit());
  const box = page.locator("#git-panel .git-box");
  await expect(box).toBeVisible();
  return box;
}

function boxSize(page) {
  return page.locator("#git-panel .git-box").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
}

function filesWidth(page) {
  return page.locator("#git-panel .gd-files").evaluate((el) => Math.round(el.getBoundingClientRect().width));
}

async function dragBy(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test("the git panel opens large enough to read a diff in", async ({ page }) => {
  await bootWorkspace(page);
  await openGitPanel(page, { fresh: true });

  const size = await boxSize(page);
  const viewport = page.viewportSize();
  expect(size.w).toBeGreaterThan(viewport.width * 0.9);
  expect(size.h).toBeGreaterThan(viewport.height * 0.8);
});

test("dragging the corner resizes the panel and the size outlives a reload", async ({ page }) => {
  await bootWorkspace(page);
  await openGitPanel(page, { fresh: true });

  const before = await boxSize(page);
  await dragBy(page, page.locator("#git-panel .git-grip-bottom-right"), -160, -120);

  const after = await boxSize(page);
  expect(after.w).toBeLessThan(before.w - 100);
  expect(after.h).toBeLessThan(before.h - 80);

  await waitForSessionContaining(page, `"w": ${after.w}`);
  await page.reload();
  await page.waitForFunction(() => !!(window.panea && window.panea.state));
  await openGitPanel(page);

  const restored = await boxSize(page);
  expect(Math.abs(restored.w - after.w)).toBeLessThanOrEqual(2);
  expect(Math.abs(restored.h - after.h)).toBeLessThanOrEqual(2);
});

test("dragging the splitter widens the file list without spilling out of the panel", async ({ page }) => {
  await bootWorkspace(page);
  await openGitPanel(page, { fresh: true });

  const before = await filesWidth(page);
  await dragBy(page, page.locator("#git-panel .gd-split"), 220, 0);

  const after = await filesWidth(page);
  expect(after).toBeGreaterThan(before + 150);
  expect(after).toBeLessThan((await boxSize(page)).w - 290);

  await page.locator("#git-panel .gd-split").dblclick();
  expect(await filesWidth(page)).toBe(before);
});

test("the panel never grows past the window it is opened in", async ({ page }) => {
  await bootWorkspace(page);
  await openGitPanel(page, { fresh: true });
  await dragBy(page, page.locator("#git-panel .git-grip-right"), 900, 0);

  const size = await boxSize(page);
  const viewport = page.viewportSize();
  expect(size.w).toBeLessThanOrEqual(viewport.width - 32);
});
