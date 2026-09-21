import { test, expect } from "@playwright/test";
import { bootWorkspace, splitPane, typeInPane, expectPaneText, activePanes, quoted } from "./helpers.js";
import { BASE_URL } from "./paths.js";

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

test("folding a browser pane keeps the loaded page alive", async ({ page }) => {
  const keep = await bootWorkspace(page);
  const browserId = await page.evaluate((url) => {
    const { state, splitPane } = window.panea;
    const before = new Set(state.panes.keys());
    splitPane(state.focusedPaneId, "h", { browser: true, url });
    return [...state.panes.keys()].find((id) => !before.has(id));
  }, `${BASE_URL}/css/tokens.css`);

  await page.waitForFunction((id) => {
    const p = window.panea.state.panes.get(id);
    return !!(p && p.view && p.view.contentDocument && p.view.contentDocument.readyState === "complete");
  }, browserId);
  const viewHandle = await page.evaluateHandle((id) => window.panea.state.panes.get(id).view, browserId);
  await page.evaluate((id) => {
    window.panea.state.panes.get(id).view.contentWindow.paneaAlive = "kept";
  }, browserId);

  const browserEl = page.locator(`.leaf[data-pane-id="${browserId}"]`);
  await browserEl.locator('[data-act="hide"]').click();
  await expect(browserEl).toHaveClass(/hidden-pane/);
  await browserEl.locator('[data-act="hide"]').click();
  await expect(browserEl).not.toHaveClass(/hidden-pane/);

  const alive = await page.evaluate((id) => {
    const view = window.panea.state.panes.get(id).view;
    try { return view.contentWindow.paneaAlive || "reloaded"; } catch { return "unreachable"; }
  }, browserId);
  expect(alive).toBe("kept");
  expect(await page.evaluate((el) => el === window.panea.state.panes.get(el.closest(".leaf").dataset.paneId).view, viewHandle)).toBe(true);
  await typeInPane(page, keep, `echo ${quoted("still-here")}`);
  await expectPaneText(page, keep, "still-here");
});

test("the last visible pane refuses to fold", async ({ page }) => {
  const only = await bootWorkspace(page);
  const onlyEl = page.locator(`.leaf[data-pane-id="${only}"]`);

  await onlyEl.locator('[data-act="hide"]').click();

  await expect(onlyEl).not.toHaveClass(/hidden-pane/);
  await expect(page.locator("#tablist .tab.active .hidden-count")).toHaveCount(0);
});
