import { test, expect } from "@playwright/test";
import { bootWorkspace, splitPane, typeInPane, paneText, expectPaneText, activePanes } from "./helpers.js";

test("splitting a pane gives two live shells that each echo only their own input", async ({ page }) => {
  const left = await bootWorkspace(page);
  const right = await splitPane(page, left, "h");

  await expect(activePanes(page)).toHaveCount(2);
  expect(right).not.toBe(left);

  await typeInPane(page, left, "echo LE''FT-OK");
  await typeInPane(page, right, "echo RI''GHT-OK");

  await expectPaneText(page, left, "LEFT-OK");
  await expectPaneText(page, right, "RIGHT-OK");

  expect(await paneText(page, left)).not.toContain("RIGHT-OK");
  expect(await paneText(page, right)).not.toContain("LEFT-OK");
});

test("a vertical split runs its own shell process", async ({ page }) => {
  const top = await bootWorkspace(page);
  const bottom = await splitPane(page, top, "v");

  await typeInPane(page, top, "echo TO''P-$$");
  await typeInPane(page, bottom, "echo BOTTO''M-$$");

  await expectPaneText(page, top, "TOP-");
  await expectPaneText(page, bottom, "BOTTOM-");

  const pidOf = (text, label) => {
    const hit = text.split("\n").map((l) => l.trim()).find((l) => new RegExp(`^${label}-\\d+$`).test(l));
    return hit ? hit.split("-")[1] : "";
  };
  const topPid = pidOf(await paneText(page, top), "TOP");
  const bottomPid = pidOf(await paneText(page, bottom), "BOTTOM");

  expect(topPid).not.toBe("");
  expect(bottomPid).not.toBe("");
  expect(topPid).not.toBe(bottomPid);
});
