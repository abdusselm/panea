import { test, expect } from "@playwright/test";
import { bootWorkspace, splitPane, typeInPane, expectPaneText, paneText, paneIds, activePanes, waitForSessionContaining, waitForShell } from "./helpers.js";

test("reloading restores the tab, both panes and their scrollback", async ({ page }) => {
  const top = await bootWorkspace(page);
  const bottom = await splitPane(page, top, "v");

  await typeInPane(page, top, "echo MA''RK-TOP");
  await expectPaneText(page, top, "MARK-TOP");
  await typeInPane(page, bottom, "echo MA''RK-BOTTOM");
  await expectPaneText(page, bottom, "MARK-BOTTOM");

  await waitForSessionContaining(page, "MARK-TOP");
  await waitForSessionContaining(page, "MARK-BOTTOM");

  await page.reload();
  await page.waitForFunction(() => !!(window.panea && window.panea.state));

  await expect(page.locator("#tablist .tab")).toHaveCount(1);
  await expect(activePanes(page)).toHaveCount(2);
  expect(await paneIds(page)).toEqual([top, bottom]);

  await expect.poll(() => paneText(page, top)).toContain("MARK-TOP");
  await expect.poll(() => paneText(page, bottom)).toContain("MARK-BOTTOM");
  await expect.poll(() => paneText(page, top)).toContain("restored session");

  await waitForShell(page, top);
  await waitForShell(page, bottom);
});

test("a folded pane is still folded after a reload", async ({ page }) => {
  const keep = await bootWorkspace(page);
  const folded = await splitPane(page, keep, "h");

  await page.locator(`.leaf[data-pane-id="${folded}"] [data-act="hide"]`).click();
  await expect(page.locator(`.leaf[data-pane-id="${folded}"]`)).toHaveClass(/hidden-pane/);
  await waitForSessionContaining(page, '"hidden": true');

  await page.reload();
  await page.waitForFunction(() => !!(window.panea && window.panea.state));

  await expect(activePanes(page)).toHaveCount(2);
  await expect(page.locator(`.leaf[data-pane-id="${folded}"]`)).toHaveClass(/hidden-pane/);
  await expect(page.locator(`.leaf[data-pane-id="${keep}"]`)).not.toHaveClass(/hidden-pane/);
  await expect(page.locator("#tablist .tab.active .hidden-count")).toHaveText("1 hidden");
});
