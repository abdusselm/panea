import { test, expect } from "@playwright/test";
import { bootWorkspace, splitPane, treeShape, dropOnPane, paneText, waitForShell } from "./helpers.js";

test("dropping a pane header on another pane's top edge re-splits it vertically", async ({ page }) => {
  const left = await bootWorkspace(page);
  const right = await splitPane(page, left, "h");

  expect(await treeShape(page)).toEqual({ dir: "h", children: [left, right] });

  await dropOnPane(page, right, left, "top");

  await expect.poll(() => treeShape(page)).toEqual({ dir: "v", children: [right, left] });
});

test("dropping a pane header on another pane's centre swaps the leaves and keeps the direction", async ({ page }) => {
  const left = await bootWorkspace(page);
  const right = await splitPane(page, left, "h");

  await dropOnPane(page, right, left, "center");

  await expect.poll(() => treeShape(page)).toEqual({ dir: "h", children: [right, left] });
});

test("dropping on a left edge nests a new split and collapses the pane's old parent", async ({ page }) => {
  const a = await bootWorkspace(page);
  const b = await splitPane(page, a, "h");
  const c = await splitPane(page, b, "v");

  expect(await treeShape(page)).toEqual({
    dir: "h",
    children: [a, { dir: "v", children: [b, c] }],
  });

  await dropOnPane(page, c, a, "left");

  await expect.poll(() => treeShape(page)).toEqual({
    dir: "h",
    children: [{ dir: "h", children: [c, a] }, b],
  });
});

test("rearranging panes keeps their shells and scrollback intact", async ({ page }) => {
  const left = await bootWorkspace(page);
  const right = await splitPane(page, left, "h");

  await page.locator(`.leaf[data-pane-id="${right}"] .leaf-term`).click();
  await page.keyboard.type("echo KEE''P-ME");
  await page.keyboard.press("Enter");
  await expect.poll(() => paneText(page, right)).toContain("KEEP-ME");

  await dropOnPane(page, right, left, "top");
  await expect.poll(() => treeShape(page)).toEqual({ dir: "v", children: [right, left] });

  expect(await paneText(page, right)).toContain("KEEP-ME");
  await waitForShell(page, right);
});
