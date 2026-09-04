import { test, expect } from "@playwright/test";
import { bootWorkspace, focusPane, expectPaneText } from "./helpers.js";

test("Cmd+Left jumps the shell cursor to the start of the line, like readline ctrl-a", async ({ page }) => {
  const paneId = await bootWorkspace(page);
  await focusPane(page, paneId);
  await page.keyboard.type("world");
  await page.keyboard.press("Meta+ArrowLeft");
  await page.keyboard.type("echo ");
  await page.keyboard.press("Enter");
  await expectPaneText(page, paneId, "world");
});

test("Cmd+Right returns the shell cursor to the end of the line, like readline ctrl-e", async ({ page }) => {
  const paneId = await bootWorkspace(page);
  await focusPane(page, paneId);
  await page.keyboard.type("echo wor");
  await page.keyboard.press("Meta+ArrowLeft");
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.type("ld");
  await page.keyboard.press("Enter");
  await expectPaneText(page, paneId, "world");
});
