import test from "node:test";
import assert from "node:assert/strict";

const { requestPaneCwd, deliverPaneCwd, forgetPaneCwd } = await import("../public/js/pane-cwd.js");

function recorder() {
  const sent = [];
  const send = (msg) => sent.push(msg);
  send.sent = sent;
  return send;
}

test("a split asks the server where the source pane actually is", async () => {
  const send = recorder();
  const answer = requestPaneCwd("p1", "/fallback", send);
  assert.deepEqual(send.sent, [{ type: "getPaneCwd", paneId: "p1" }]);

  deliverPaneCwd("p1", "/Users/me/proje/api");
  assert.equal(await answer, "/Users/me/proje/api");
});

test("a server that stays silent never stalls the split", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const answer = requestPaneCwd("p2", "/last/known", recorder());
  t.mock.timers.tick(401);
  assert.equal(await answer, "/last/known", "the split must fall back, not hang");
});

test("an empty answer falls back rather than opening in the home directory", async () => {
  const answer = requestPaneCwd("p3", "/last/known", recorder());
  deliverPaneCwd("p3", "");
  assert.equal(await answer, "/last/known");
});

test("a reply for a pane nobody asked about is ignored", async () => {
  const answer = requestPaneCwd("p4", "/fallback", recorder());
  deliverPaneCwd("other", "/somewhere/else");
  deliverPaneCwd("p4", "/right/place");
  assert.equal(await answer, "/right/place");
});

test("splitting the same pane twice in a row leaves no request hanging", async () => {
  const send = recorder();
  const first = requestPaneCwd("p5", "/fallback", send);
  const second = requestPaneCwd("p5", "/fallback", send);

  assert.equal(await first, "/fallback", "the superseded request must settle on its own");
  deliverPaneCwd("p5", "/Users/me/proje");
  assert.equal(await second, "/Users/me/proje");
  assert.equal(send.sent.length, 2);
});

test("closing the source pane mid-request settles it instead of leaking", async () => {
  const answer = requestPaneCwd("p6", "/fallback", recorder());
  forgetPaneCwd("p6");
  assert.equal(await answer, "/fallback");
});

test("with no socket to ask, the split still gets a directory", async () => {
  assert.equal(await requestPaneCwd("p7", "/fallback", null), "/fallback");
});
