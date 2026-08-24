import test from "node:test";
import assert from "node:assert/strict";

function classList(node) {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, on) => (on ? set.add(c) : set.delete(c)),
  };
}

function element(id) {
  const node = {
    id: id || "",
    className: "",
    textContent: "",
    dataset: {},
    children: [],
    parentNode: null,
    classList: classList(),
    append: (...kids) => {
      for (const kid of kids) {
        kid.parentNode = node;
        node.children.push(kid);
      }
    },
    insertBefore: (fresh) => {
      fresh.parentNode = node;
      node.children.push(fresh);
    },
  };
  return node;
}

function installDom() {
  const sidebar = element("sidebar");
  const tablist = element("tablist");
  tablist.parentNode = sidebar;
  const body = element("body");
  globalThis.document = {
    body,
    hasFocus: () => true,
    createElement: () => element(),
    getElementById: (id) => (id === "tablist" ? tablist : null),
  };
  return { sidebar, body };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { sidebar, body } = installDom();
const { setConnectionState } = await import("../public/js/connection-status.js");

function banner() {
  return sidebar.children.find((c) => c.id === "conn-status") || null;
}

function visible() {
  const b = banner();
  return !!b && b.classList.contains("show");
}

test("a reconnect faster than the threshold never shows anything", async () => {
  setConnectionState("reconnecting");
  await wait(200);
  setConnectionState("restored");

  await wait(900);
  assert.equal(visible(), false, "a sub-threshold blip must stay invisible");
  assert.equal(body.classList.contains("disconnected"), false, "panes must not dim on a blip");
});

test("a reconnect slower than the threshold announces itself and dims the panes", async () => {
  setConnectionState("reconnecting");
  await wait(200);
  assert.equal(visible(), false, "announced before the threshold elapsed");

  await wait(900);
  assert.equal(visible(), true, "a real disconnect must be announced");
  assert.equal(banner().dataset.kind, "reconnecting");
  assert.equal(body.classList.contains("disconnected"), true, "panes must dim while disconnected");

  setConnectionState("restored");
  assert.equal(body.classList.contains("disconnected"), false, "panes must undim on restore");
  assert.equal(banner().dataset.kind, "restored");
  assert.equal(visible(), true, "the restore confirmation must be shown");
});

test("the restore confirmation clears itself", async () => {
  setConnectionState("reconnecting");
  await wait(1000);
  assert.equal(visible(), true);

  setConnectionState("restored");
  assert.equal(visible(), true);

  await wait(2500);
  assert.equal(visible(), false, "the restore confirmation never went away");
});

test("repeated failed attempts keep the banner up rather than resetting it", async () => {
  setConnectionState("reconnecting");
  await wait(1000);
  assert.equal(visible(), true);

  setConnectionState("reconnecting");
  setConnectionState("reconnecting");
  assert.equal(visible(), true, "a retry hid the banner it should have kept");
  assert.equal(body.classList.contains("disconnected"), true);

  setConnectionState("online");
  assert.equal(body.classList.contains("disconnected"), false);
});

test("a first connection is silent", async () => {
  setConnectionState("online");
  await wait(50);
  assert.equal(visible(), false);
  assert.equal(body.classList.contains("disconnected"), false);
});
