"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Core = require("../public/js/mentor-connection-core.js");

test("capability order is frozen and AI consent stays optional", () => {
  assert.deepEqual(Core.ORDER, ["ACCOUNT", "SYNC", "TELEGRAM", "AI_CONSENT"]);
  assert.equal(Core.deriveJourney({}).steps[3].optional, true);
});

test("guest starts at account without exposing later actions", () => {
  const out = Core.deriveJourney({ account: { connected: false } });
  assert.deepEqual(out.steps.map((step) => step.state), ["CURRENT", "LOCKED", "LOCKED", "LOCKED"]);
  assert.equal(out.steps[0].action, "OPEN_ACCOUNT");
  assert.equal(out.steps[1].action, null);
});

test("connected account advances to an explicit sync step", () => {
  const out = Core.deriveJourney({ account: { connected: true }, sync: { ready: false } });
  assert.deepEqual(out.steps.map((step) => step.state), ["COMPLETE", "CURRENT", "LOCKED", "LOCKED"]);
  assert.equal(out.steps[1].action, "RUN_SYNC");
});

test("successful sync advances to Telegram and preserves pending confirmation", () => {
  const ready = Core.deriveJourney({ account: { connected: true }, sync: { ready: true }, telegram: {} });
  assert.deepEqual(ready.steps.map((step) => step.state), ["COMPLETE", "COMPLETE", "CURRENT", "LOCKED"]);
  assert.equal(ready.steps[2].action, "CONNECT_TELEGRAM");

  const pending = Core.deriveJourney({ account: { connected: true }, sync: { ready: true }, telegram: { pending: true } });
  assert.equal(pending.steps[2].state, "PENDING");
  assert.equal(pending.steps[2].action, "OPEN_TELEGRAM");
  assert.equal(pending.steps[3].state, "LOCKED");
});

test("linked Telegram unlocks optional AI consent", () => {
  const out = Core.deriveJourney({
    account: { connected: true }, sync: { ready: true }, telegram: { linked: true }, ai: { granted: false },
  });
  assert.deepEqual(out.steps.map((step) => step.state), ["COMPLETE", "COMPLETE", "COMPLETE", "OPTIONAL"]);
  assert.equal(out.steps[3].action, "REVIEW_AI_CONSENT");

  const granted = Core.deriveJourney({
    account: { connected: true }, sync: { ready: true }, telegram: { linked: true }, ai: { granted: true },
  });
  assert.equal(granted.steps[3].state, "COMPLETE");
});

test("profile mismatch fails closed at account", () => {
  const out = Core.deriveJourney({
    account: { connected: true, profileMismatch: true }, sync: { ready: true }, telegram: { linked: true }, ai: { granted: true },
  });
  assert.deepEqual(out.steps.map((step) => step.state), ["ERROR", "LOCKED", "LOCKED", "LOCKED"]);
  assert.equal(out.steps[0].action, "OPEN_ACCOUNT");
});

test("derived journey contains only bounded presentation facts", () => {
  const out = Core.deriveJourney({
    account: { connected: true, userId: "owner-secret" },
    sync: { ready: true, csrf: "secret" }, telegram: { linked: true, deepLink: "secret" }, ai: { granted: false },
  });
  const serialized = JSON.stringify(out);
  assert.doesNotMatch(serialized, /owner-secret|csrf|deepLink|secret/);
});
