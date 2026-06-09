"use strict";

// BRR-P0-010 · Unit tests for the pure /api/audio/cache/upload authorization
// decision. This is the AUTHORITATIVE gate: api-smoke runs on loopback, so the
// remote-403 path is only fully exercised here (and, since the revised gate
// requires the token even on loopback when the secret is set, api-smoke can also
// prove the lock — see scripts/api-smoke.js).

const test = require("node:test");
const assert = require("node:assert/strict");
const { decideAudioUploadAuth } = require("../../db/premium/audioUploadAuth");

test("secret set + token matches → authorized (even when not loopback)", () => {
  const v = decideAudioUploadAuth({ secretSet: true, tokenMatches: true, isLoopback: false });
  assert.equal(v.authorized, true);
});

test("secret set + token matches + loopback → authorized", () => {
  const v = decideAudioUploadAuth({ secretSet: true, tokenMatches: true, isLoopback: true });
  assert.equal(v.authorized, true);
});

test("secret set + wrong/absent token (remote) → 403 BAD_UPLOAD_TOKEN", () => {
  const v = decideAudioUploadAuth({ secretSet: true, tokenMatches: false, isLoopback: false });
  assert.equal(v.authorized, false);
  assert.equal(v.status, 403);
  assert.equal(v.error, "BAD_UPLOAD_TOKEN");
});

test("secret set + wrong token + loopback → STILL 403 (loopback never bypasses a set secret; XFF-spoof defence)", () => {
  const v = decideAudioUploadAuth({ secretSet: true, tokenMatches: false, isLoopback: true });
  assert.equal(v.authorized, false);
  assert.equal(v.status, 403);
  assert.equal(v.error, "BAD_UPLOAD_TOKEN");
});

test("secret unset + loopback → authorized (pure dev convenience)", () => {
  const v = decideAudioUploadAuth({ secretSet: false, tokenMatches: false, isLoopback: true });
  assert.equal(v.authorized, true);
});

test("secret unset + remote → 503 UPLOAD_DISABLED (fail-closed)", () => {
  const v = decideAudioUploadAuth({ secretSet: false, tokenMatches: false, isLoopback: false });
  assert.equal(v.authorized, false);
  assert.equal(v.status, 503);
  assert.equal(v.error, "UPLOAD_DISABLED");
});

test("defensive: secret unset but tokenMatches truthy is ignored (falls to no-secret branch)", () => {
  // The server computes tokenMatches = secretSet && compare(...), so this input
  // can't actually occur — assert decide() never authorizes a remote on it.
  const v = decideAudioUploadAuth({ secretSet: false, tokenMatches: true, isLoopback: false });
  assert.equal(v.authorized, false);
  assert.equal(v.status, 503);
  assert.equal(v.error, "UPLOAD_DISABLED");
});

test("no args → does not throw, denies (503 disabled)", () => {
  const v = decideAudioUploadAuth();
  assert.equal(v.authorized, false);
  assert.equal(v.status, 503);
});

// Documentation-as-assertion: X-Local-Mode and ALLOW_REMOTE_AUDIO_PREFETCH are not
// parameters of the decision at all, so there is no input by which a remote caller
// can be authorized without a matching token when the secret is set. The exhaustive
// {secretSet,tokenMatches,isLoopback} cases above cover every reachable combination.
test("the only remote-authorizing path requires tokenMatches=true (no header bypass exists)", () => {
  for (const isLoopback of [false]) {
    const denied = decideAudioUploadAuth({ secretSet: true, tokenMatches: false, isLoopback });
    assert.equal(denied.authorized, false, "remote + secret set + no token must be denied");
  }
  const allowed = decideAudioUploadAuth({ secretSet: true, tokenMatches: true, isLoopback: false });
  assert.equal(allowed.authorized, true, "remote authorizes ONLY with a matching token");
});
