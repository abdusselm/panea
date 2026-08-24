import test from "node:test";
import assert from "node:assert/strict";

import { isAllowedOrigin, isAllowedHost, verifyClient } from "../server/origin.js";

test("accepts loopback origins", () => {
  for (const origin of [
    "http://127.0.0.1:4820",
    "http://localhost:4820",
    "http://localhost:9999",
    "http://[::1]:4820",
  ]) {
    assert.equal(isAllowedOrigin(origin), true, origin);
  }
});

test("rejects every other origin", () => {
  for (const origin of [
    "http://evil.com",
    "http://evil.com:4820",
    "https://evil.com",
    "null",
    "http://127.0.0.1.evil.com",
    "http://localhost.evil.com",
  ]) {
    assert.equal(isAllowedOrigin(origin), false, origin);
  }
});

test("allows a missing origin, which no browser can produce", () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin(""), true);
});

test("verifyClient mirrors isAllowedOrigin", () => {
  assert.equal(verifyClient({ origin: "http://127.0.0.1:4820" }), true);
  assert.equal(verifyClient({ origin: "http://evil.com" }), false);
});

test("accepts loopback hosts and rejects the rest", () => {
  assert.equal(isAllowedHost("127.0.0.1:4820"), true);
  assert.equal(isAllowedHost("localhost:4820"), true);
  assert.equal(isAllowedHost("[::1]:4820"), true);
  assert.equal(isAllowedHost("evil.com:4820"), false);
  assert.equal(isAllowedHost("rebind.io"), false);
  assert.equal(isAllowedHost(""), false);
  assert.equal(isAllowedHost(undefined), false);
});
