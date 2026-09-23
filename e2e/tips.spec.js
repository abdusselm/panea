import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { STATE_DIR } from "./paths.js";
import { bootWorkspace, activePanes, paneIds, focusPane } from "./helpers.js";

const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");

function storedTips() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")).tips || {};
  } catch {
    return {};
  }
}

async function freshTips(page) {
  await page.evaluate(() => { window.panea.setTipsEnabled(true); window.panea.resetTips(); });
}

async function openTab(page) {
  const tabs = page.locator("#tablist .tab");
  const before = await tabs.count();
  await page.locator("#new-tab").click();
  await expect(tabs).toHaveCount(before + 1);
  await expect(activePanes(page)).toHaveCount(1);
  const [paneId] = await paneIds(page);
  return paneId;
}

test("a new terminal shows one tip, and typing in it dismisses the tip", async ({ page }) => {
  await bootWorkspace(page);
  await freshTips(page);
  const paneId = await openTab(page);
  const tip = page.locator(`.leaf[data-pane-id="${paneId}"] .pane-tip`);
  await expect(tip).toBeVisible();
  await expect(page.locator(".pane-tip")).toHaveCount(1);

  await focusPane(page, paneId);
  await expect(tip).toBeVisible();
  await page.keyboard.type("x");
  await expect(page.locator(".pane-tip")).toHaveCount(0);
});

test("clicking the shortcut in a tip runs it and retires the tip", async ({ page }) => {
  await bootWorkspace(page);
  await freshTips(page);
  await openTab(page);
  const tip = page.locator(".pane-tip");
  await expect(tip).toHaveAttribute("data-tip", "reopen-tab");

  const tabs = page.locator("#tablist .tab");
  const before = await tabs.count();
  await tip.locator(".pane-tip-key.runnable").click();
  await expect(tabs).toHaveCount(before + 1);
  await expect(page.locator(".pane-tip")).toHaveCount(0);
  await expect.poll(() => storedTips().retired || []).toContain("reopen-tab");
});

test("dismissing a tip retires it, and the settings switch turns tips off", async ({ page }) => {
  await bootWorkspace(page);
  await freshTips(page);
  await openTab(page);
  const tip = page.locator(".pane-tip");
  await expect(tip).toBeVisible();
  const tipId = await tip.getAttribute("data-tip");
  await tip.locator(".pane-tip-close").click();
  await expect(page.locator(".pane-tip")).toHaveCount(0);
  await expect.poll(() => storedTips().retired || []).toContain(tipId);

  await page.locator("#settings-btn").click();
  const toggle = page.locator("#settings-panel .sr-toggle");
  await expect(toggle).toHaveText("On");
  await toggle.click();
  await expect(toggle).toHaveText("Off");
  await page.locator("#settings-panel .settings-close").click();
  await expect.poll(() => storedTips().enabled).toBe(false);

  await page.evaluate(() => window.panea.resetTips());
  await openTab(page);
  await page.waitForTimeout(500);
  await expect(page.locator(".pane-tip")).toHaveCount(0);

  await page.evaluate(() => window.panea.setTipsEnabled(true));
  await expect.poll(() => storedTips().enabled).toBe(true);
});
