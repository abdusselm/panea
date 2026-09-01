import fs from "node:fs";
import { expect } from "@playwright/test";
import { SESSION_FILE } from "./paths.js";

const ACTIVE_PANES = "#workspace .tabpane.active .leaf[data-pane-id]";

export function quoted(token) {
  return `${token.slice(0, 2)}''${token.slice(2)}`;
}

export function activePanes(page) {
  return page.locator(ACTIVE_PANES);
}

export function paneIds(page) {
  return activePanes(page).evaluateAll((els) => els.map((el) => el.dataset.paneId));
}

export async function otherPaneId(page, knownId) {
  const ids = await paneIds(page);
  return ids.find((id) => id !== knownId);
}

export function paneText(page, paneId) {
  return page.evaluate((id) => {
    const pane = window.panea.state.panes.get(id);
    if (!pane) return "";
    const buffer = pane.term.buffer.active;
    const lines = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join("\n");
  }, paneId);
}

export async function expectPaneText(page, paneId, needle) {
  await expect
    .poll(() => paneText(page, paneId), { message: `pane ${paneId} never printed ${needle}` })
    .toContain(needle);
}

export function treeLeafOrder(page) {
  return page.evaluate(() => {
    const { state } = window.panea;
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.kind === "leaf") out.push(node.id);
      else { walk(node.children[0]); walk(node.children[1]); }
    };
    walk(tab.tree);
    return out;
  });
}

export function treeShape(page) {
  return page.evaluate(() => {
    const { state } = window.panea;
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    const walk = (node) =>
      node.kind === "leaf"
        ? node.id
        : { dir: node.dir, children: [walk(node.children[0]), walk(node.children[1])] };
    return walk(tab.tree);
  });
}

export async function focusPane(page, paneId) {
  await page.locator(`.leaf[data-pane-id="${paneId}"] .leaf-term`).click();
}

export async function typeInPane(page, paneId, text) {
  await focusPane(page, paneId);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

export async function waitForShell(page, paneId) {
  const token = `RDY${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await typeInPane(page, paneId, `echo ${quoted(token)}`);
  await expectPaneText(page, paneId, token);
}

export async function splitPane(page, paneId, dir) {
  const before = await paneIds(page);
  await page.locator(`.leaf[data-pane-id="${paneId}"] [data-act="split-${dir}"]`).click();
  await expect(activePanes(page)).toHaveCount(before.length + 1);
  const fresh = (await paneIds(page)).find((id) => !before.includes(id));
  await waitForShell(page, fresh);
  return fresh;
}

export async function dropOnPane(page, dragId, targetId, side) {
  const target = page.locator(`.leaf[data-pane-id="${targetId}"]`);
  const box = await target.boundingBox();
  const spot = {
    left: { x: Math.round(box.width * 0.06), y: Math.round(box.height / 2) },
    right: { x: Math.round(box.width * 0.94), y: Math.round(box.height / 2) },
    top: { x: Math.round(box.width / 2), y: Math.round(box.height * 0.06) },
    bottom: { x: Math.round(box.width / 2), y: Math.round(box.height * 0.94) },
    center: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) },
  }[side];
  await page.locator(`.leaf[data-pane-id="${dragId}"] .leaf-bar`).dragTo(target, { targetPosition: spot });
}

export async function closeAllTabs(page) {
  const rows = page.locator("#tablist .tab");
  for (let guard = 0; guard < 25 && (await rows.count()) > 0; guard++) {
    await rows.first().locator(".close").click();
  }
  await expect(rows).toHaveCount(0);
}

export async function bootWorkspace(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!(window.panea && window.panea.state));
  await closeAllTabs(page);
  await page.locator("#new-tab").click();
  await expect(activePanes(page)).toHaveCount(1);
  const [paneId] = await paneIds(page);
  await waitForShell(page, paneId);
  return paneId;
}

export function readSessionFile() {
  try {
    return fs.readFileSync(SESSION_FILE, "utf8");
  } catch {
    return "";
  }
}

export async function waitForSessionContaining(page, needle) {
  await page.evaluate(() => window.panea.persist());
  await expect
    .poll(readSessionFile, { message: `session.json never contained ${needle}` })
    .toContain(needle);
}
