import { test, expect } from "@playwright/test";
import { bootWorkspace, splitPane, typeInPane, expectPaneText, activePanes, quoted } from "./helpers.js";

test("folding a pane parks it on the rail and keeps the same shell running", async ({ page }) => {
  const keep = await bootWorkspace(page);
  const folded = await splitPane(page, keep, "h");

  await typeInPane(page, folded, `PANEA_E2E=${quoted("alive-42")}`);

  const foldedEl = page.locator(`.leaf[data-pane-id="${folded}"]`);
  await foldedEl.locator('[data-act="hide"]').click();

  await expect(foldedEl).toHaveClass(/hidden-pane/);
  await expect(foldedEl).toHaveClass(/rail-col/);
  await expect(activePanes(page)).toHaveCount(2);
  await expect(page.locator("#tablist .tab.active .hidden-count")).toHaveText("1 hidden");
  await expect(page.locator(`.leaf[data-pane-id="${keep}"]`)).not.toHaveClass(/hidden-pane/);

  await foldedEl.locator('[data-act="hide"]').click();
  await expect(foldedEl).not.toHaveClass(/hidden-pane/);
  await expect(page.locator("#tablist .tab.active .hidden-count")).toHaveCount(0);

  await typeInPane(page, folded, "echo $PANEA_E2E");
  await expectPaneText(page, folded, "alive-42");
});

test("a folded pane survives a vertical split as a rail row", async ({ page }) => {
  const keep = await bootWorkspace(page);
  const folded = await splitPane(page, keep, "v");

  const foldedEl = page.locator(`.leaf[data-pane-id="${folded}"]`);
  await foldedEl.locator('[data-act="hide"]').click();

  await expect(foldedEl).toHaveClass(/rail-row/);
  await expect(page.locator("#workspace .tabpane.active .split-gutter.locked")).toHaveCount(1);
});

test("the last visible pane refuses to fold", async ({ page }) => {
  const only = await bootWorkspace(page);
  const onlyEl = page.locator(`.leaf[data-pane-id="${only}"]`);

  await onlyEl.locator('[data-act="hide"]').click();

  await expect(onlyEl).not.toHaveClass(/hidden-pane/);
  await expect(page.locator("#tablist .tab.active .hidden-count")).toHaveCount(0);
});
