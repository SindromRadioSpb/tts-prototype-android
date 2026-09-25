"use strict";

// R1 (UI release program 2026-09-25): a new visitor used to meet three modals in a row
// (server migration, a jargon-heavy welcome, BYOK keys) over a Studio that showed a
// "this is a simple prototype" placeholder. These tests pin the calm first run.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readLf = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8").replace(/\r\n/g, "\n");
const html = readLf("public/index.html");
const between = (from, to) => {
  const start = html.indexOf(from);
  assert.ok(start >= 0, "missing: " + from);
  const end = html.indexOf(to, start + from.length);
  assert.ok(end > start, "missing end marker: " + to);
  return html.slice(start, end);
};

test("server-migration prompt requires a positive server library count", () => {
  const body = between("async function v3Phase6MaybeShow", "\n}\n");
  assert.match(body, /v3Phase6ServerLibraryCount\(\)/);
  assert.match(body, /if \(!\(count > 0\)\)/, "no prompt when the count is 0, unknown or the endpoint is gone");
});

test("a gone or empty server library is remembered as a fresh local start; a network failure is not", () => {
  const probe = between("async function v3Phase6ServerLibraryCount", "\n}\n");
  assert.match(probe, /r\.status === 404 \|\| r\.status === 410/, "404/410 mean there is nothing to migrate");
  const body = between("async function v3Phase6MaybeShow", "\n}\n");
  assert.match(body, /count === 0/);
  assert.match(body, /localStorage\.setItem\("localMode", "1"\)/);
  assert.match(body, /V3_PHASE6_DECISION_KEY, "none-on-server"/);
});

test("BYOK onboarding is not shown unsolicited on load", () => {
  const init = between("function byokOnboardingInit", "BYOK GUIDED TOUR");
  assert.doesNotMatch(init, /byokOnboardingShow\(\)/, "keys are explained where a paid action needs one, not on arrival");
});

test("the welcome offers three plain choices: read, learn from video, add own text", () => {
  const modal = between('<div id="v3OnboardingModal"', "<!-- ── App footer");
  for (const go of ["room", "mediatheque", "studio"]) assert.match(modal, new RegExp(`data-onb-go="${go}"`));
  assert.doesNotMatch(modal, /v3-onb-feature|v3OnbDontShow/, "no feature list, no extra checkbox");
});

test("welcome copy has no jargon in any locale", () => {
  for (const locale of ["ru", "en", "he"]) {
    const src = readLf(`public/i18n/locales/${locale}.js`);
    const start = src.indexOf("\n  onboarding: {");
    assert.ok(start >= 0, `${locale}: onboarding block`);
    const block = src.slice(start, src.indexOf("\n  },", start));
    for (const word of ["IDE", "offline-first", "TTS", "SRS", "[[", "quota", "квот"]) {
      assert.ok(!block.includes(word), `${locale}: onboarding copy still says "${word}"`);
    }
    for (const key of ["goRoom", "goRoomHint", "goMedia", "goMediaHint", "goStudio", "goStudioHint"]) {
      assert.ok(block.includes(`    ${key}: "`), `${locale}: onboarding.${key}`);
    }
  }
});

test("the Studio starts empty with a helpful placeholder and a real page title", () => {
  const textarea = between('<textarea id="inputText"', "</textarea>");
  assert.ok(!textarea.includes("אבטיפוס"), "no 'simple prototype of the system' placeholder text");
  assert.match(textarea, />$/, "textarea has no default content");
  assert.doesNotMatch(html.slice(0, 2000), /<title>TTS & Translator Dashboard<\/title>/);
  assert.match(html.slice(0, 2000), /<title>LinguistPro — Студия<\/title>/);
});
