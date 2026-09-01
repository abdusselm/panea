import { test, expect } from "@playwright/test";
import { bootWorkspace, activePanes, otherPaneId, waitForShell, paneText, typeInPane } from "./helpers.js";

async function openPalette(page) {
  await page.locator("#cmdk").click();
  await expect(page.locator("#palette")).toHaveClass(/open/);
  return page.locator("#palette .palette-input");
}

test("the palette filters commands and splits the focused pane", async ({ page }) => {
  const first = await bootWorkspace(page);

  const input = await openPalette(page);
  await input.fill("split right");
  await expect(page.locator("#palette .palette-item").first()).toContainText("Split right");

  await page.keyboard.press("Enter");
  await expect(page.locator("#palette")).not.toHaveClass(/open/);
  await expect(activePanes(page)).toHaveCount(2);

  const fresh = await otherPaneId(page, first);
  await waitForShell(page, fresh);
});

test("the palette opens with the keyboard and closes on Escape", async ({ page }) => {
  await bootWorkspace(page);

  await page.keyboard.press("Meta+k");
  await expect(page.locator("#palette")).toHaveClass(/open/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#palette")).not.toHaveClass(/open/);
});

test("a palette query that matches nothing reports it instead of running a command", async ({ page }) => {
  const only = await bootWorkspace(page);

  const input = await openPalette(page);
  await input.fill("zzzznotacommand");
  await expect(page.locator("#palette .palette-empty")).toHaveText("No matching commands");

  await page.keyboard.press("Enter");
  await expect(page.locator("#palette")).not.toHaveClass(/open/);
  await expect(activePanes(page)).toHaveCount(1);

  await typeInPane(page, only, "echo ST''ILL-ALIVE");
  await expect.poll(() => paneText(page, only)).toContain("STILL-ALIVE");
});
