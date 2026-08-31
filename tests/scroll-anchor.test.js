import test from "node:test";
import assert from "node:assert/strict";

function classList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
  };
}

function element() {
  const node = {
    className: "",
    textContent: "",
    title: "",
    type: "",
    onclick: null,
    children: [],
    parentNode: null,
    classList: classList(),
    addEventListener: () => {},
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

globalThis.document = { hasFocus: () => true, createElement: () => element() };

const frames = [];
globalThis.requestAnimationFrame = (fn) => frames.push(fn) && frames.length;
globalThis.cancelAnimationFrame = (id) => { frames[id - 1] = null; };
function flush() {
  const due = frames.splice(0, frames.length);
  for (const fn of due) if (fn) fn();
}

const { state } = await import("../public/js/state.js");
const { wireScrollAnchor, closeScrollAnchorFor, jumpToBottom, toggleScrollAnchor } =
  await import("../public/js/scroll-anchor.js");

function fakePane(id, { baseY = 500, viewportY = 500 } = {}) {
  const buffer = { active: { baseY, viewportY } };
  const disposed = [];
  const handlers = { scroll: [], render: [] };
  const pane = {
    id,
    exited: false,
    el: element(),
    focused: 0,
    term: {
      buffer,
      focus: () => { pane.focused++; },
      scrollToBottom: () => { buffer.active.viewportY = buffer.active.baseY; },
      scrollToLine: (line) => { buffer.active.viewportY = line; },
      onScroll: (fn) => { handlers.scroll.push(fn); return { dispose: () => disposed.push("scroll") }; },
      onRender: (fn) => { handlers.render.push(fn); return { dispose: () => disposed.push("render") }; },
    },
    disposed,
    emitScroll: () => { for (const fn of handlers.scroll) fn(); flush(); },
  };
  state.panes.set(id, pane);
  wireScrollAnchor(pane);
  return pane;
}

function pill(pane) {
  return pane.el.children.find((c) => c.className === "scroll-anchor");
}
function label(pane) {
  return pill(pane).children[0].children[1].textContent;
}
function click(pane) {
  pill(pane).children[0].onclick({ stopPropagation: () => {} });
  flush();
}

test.afterEach(() => {
  for (const id of [...state.panes.keys()]) { closeScrollAnchorFor(id); state.panes.delete(id); }
  frames.length = 0;
});

test("a pane sitting at the bottom shows nothing", () => {
  const pane = fakePane("p1");
  pane.emitScroll();
  assert.equal(pill(pane).classList.contains("open"), false);
});

test("scrolling up announces how far behind the pane is", () => {
  const pane = fakePane("p2");
  pane.term.buffer.active.viewportY = 380;
  pane.emitScroll();
  assert.equal(pill(pane).classList.contains("open"), true);
  assert.equal(label(pane), "120 below");
});

test("a long scrollback is counted in thousands, not raw digits", () => {
  const pane = fakePane("p3", { baseY: 4800, viewportY: 3300 });
  pane.emitScroll();
  assert.equal(label(pane), "1.5k below");
});

test("jumping to the latest output remembers where the reader was", () => {
  const pane = fakePane("p4");
  pane.term.buffer.active.viewportY = 380;
  pane.emitScroll();

  click(pane);
  assert.equal(pane.term.buffer.active.viewportY, 500, "must land on the newest output");
  assert.equal(pill(pane).classList.contains("back"), true, "the way back must be offered");
  assert.equal(label(pane), "Back");
  assert.ok(pane.focused > 0, "the keyboard must go back to the terminal");

  click(pane);
  assert.equal(pane.term.buffer.active.viewportY, 380, "must return to the abandoned position");
  assert.equal(pill(pane).classList.contains("back"), false, "the mark is spent once taken");
  assert.equal(label(pane), "120 below", "back up in history, the way down is offered again");
});

test("output arriving while the reader is at the bottom leaves the pill alone", () => {
  const pane = fakePane("p5");
  pane.term.buffer.active.baseY = 620;
  pane.term.buffer.active.viewportY = 620;
  pane.emitScroll();
  assert.equal(pill(pane).classList.contains("open"), false);
});

test("the way back expires so a stale position is never restored", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pane = fakePane("p6");
  pane.term.buffer.active.viewportY = 380;
  pane.emitScroll();
  click(pane);
  assert.equal(pill(pane).classList.contains("back"), true);

  t.mock.timers.tick(12001);
  flush();
  assert.equal(pill(pane).classList.contains("open"), false, "an expired mark must not linger");

  click(pane);
  assert.equal(pane.term.buffer.active.viewportY, 500, "an expired mark must not scroll anywhere");
});

test("a pane at the bottom with no mark ignores the jump shortcut", () => {
  const pane = fakePane("p7");
  jumpToBottom("p7");
  flush();
  assert.equal(pill(pane).classList.contains("open"), false, "nothing to jump to, nothing to offer");
  toggleScrollAnchor("p7");
  flush();
  assert.equal(pill(pane).classList.contains("open"), false);
});

test("closing a pane releases its listeners and its pill", () => {
  const pane = fakePane("p8");
  pane.term.buffer.active.viewportY = 380;
  pane.emitScroll();
  const node = pill(pane);

  closeScrollAnchorFor("p8");
  assert.deepEqual(pane.disposed.sort(), ["render", "scroll"]);
  assert.equal(node.parentNode, null, "the pill must leave the DOM with the pane");
  assert.equal(pane.el.children.includes(node), false);
});
