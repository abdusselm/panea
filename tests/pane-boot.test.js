import test from "node:test";
import assert from "node:assert/strict";

function classList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
    toggle: (c, on) => { if (on) set.add(c); else set.delete(c); },
  };
}

function element() {
  const node = {
    className: "",
    textContent: "",
    children: [],
    parentNode: null,
    classList: classList(),
    append: (...kids) => {
      for (const kid of kids) { kid.parentNode = node; node.children.push(kid); }
    },
    appendChild: (kid) => { kid.parentNode = node; node.children.push(kid); },
    removeChild: (kid) => {
      node.children = node.children.filter((c) => c !== kid);
      kid.parentNode = null;
    },
  };
  return node;
}

globalThis.document = { createElement: () => element() };

const { wirePaneBoot, markPaneBooting, markPaneReady, noteBootInput, closePaneBootFor } =
  await import("../public/js/pane-boot.js");

const live = new Set();

function fakePane(id) {
  const pane = { id, el: element() };
  wirePaneBoot(pane);
  live.add(id);
  return pane;
}

function badge(pane) {
  return pane.el.children.find((c) => c.className === "pane-boot");
}
function label(pane) {
  return badge(pane).children[1].textContent;
}
function showing(pane) {
  return badge(pane).classList.contains("open");
}

function type(paneId, text) {
  noteBootInput(paneId);
  return new TextEncoder().encode(text);
}

test.afterEach(() => {
  for (const id of live) closePaneBootFor(id);
  live.clear();
});

test("a shell that answers within a second never flashes a badge", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p1");
  markPaneBooting("p1");
  assert.equal(showing(pane), false, "nothing to announce before the first tick");

  markPaneReady("p1", new TextEncoder().encode("\x1b[?2004h$ "));
  t.mock.timers.tick(3000);
  assert.equal(showing(pane), false, "a fast shell must stay invisible");
});

test("a slow shell says it is still starting, and for how long", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p2");
  markPaneBooting("p2");

  t.mock.timers.tick(1000);
  assert.equal(showing(pane), true);
  assert.equal(label(pane), "starting shell… 1s");

  t.mock.timers.tick(2000);
  assert.equal(label(pane), "starting shell… 3s", "the count must keep moving");
});

test("a startup dragging past six seconds blames the shell config", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p3");
  markPaneBooting("p3");

  t.mock.timers.tick(5000);
  assert.equal(badge(pane).classList.contains("slow"), false);

  t.mock.timers.tick(1000);
  assert.equal(badge(pane).classList.contains("slow"), true);
  assert.equal(label(pane), "starting shell… 6s · slow shell config");
});

test("the tty echoing keystrokes back is not the shell waking up", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p4");
  markPaneBooting("p4");
  t.mock.timers.tick(1000);
  assert.equal(showing(pane), true);

  markPaneReady("p4", type("p4", "ls\r\n"));
  assert.equal(showing(pane), true, "kernel echo must not be mistaken for a prompt");

  t.mock.timers.tick(1000);
  assert.equal(label(pane), "starting shell… 2s", "the badge must keep counting");
});

test("the prompt clears the badge even after the user typed ahead", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p5");
  markPaneBooting("p5");
  t.mock.timers.tick(1000);
  markPaneReady("p5", type("p5", "ls\r\n"));
  assert.equal(showing(pane), true);

  markPaneReady("p5", new TextEncoder().encode("\r\n\x1b[38;5;110m~/panea\x1b[39m\r\n❯ "));
  assert.equal(showing(pane), false, "an escape sequence only a shell emits ends the wait");

  t.mock.timers.tick(3000);
  assert.equal(showing(pane), false, "a settled pane must not be repainted");
});

test("a shell that dies before printing anything stops the wait", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p6");
  markPaneBooting("p6");
  t.mock.timers.tick(2000);
  assert.equal(showing(pane), true);

  markPaneReady("p6");
  assert.equal(showing(pane), false, "the exit notice must not sit under a spinner");
});

test("a restarted pane waits on its new shell all over again", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p7");
  markPaneBooting("p7");
  t.mock.timers.tick(7000);
  assert.equal(badge(pane).classList.contains("slow"), true);
  markPaneReady("p7", new TextEncoder().encode("\x1b[?2004h"));

  markPaneBooting("p7");
  t.mock.timers.tick(1000);
  assert.equal(label(pane), "starting shell… 1s", "the clock must restart, not resume");
  assert.equal(badge(pane).classList.contains("slow"), false);
});

test("closing a pane takes its badge and its timer with it", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const pane = fakePane("p8");
  markPaneBooting("p8");
  t.mock.timers.tick(1000);
  const node = badge(pane);

  closePaneBootFor("p8");
  live.delete("p8");
  assert.equal(node.parentNode, null, "the badge must leave the DOM with the pane");
  assert.equal(pane.el.children.includes(node), false);

  t.mock.timers.tick(5000);
  assert.equal(node.children[1].textContent, "starting shell… 1s", "a closed pane must stop being painted");
});
