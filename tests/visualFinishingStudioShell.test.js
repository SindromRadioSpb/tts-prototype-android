"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const packet = read("docs/planning/ROOM_UX_VISUAL_FINISHING_VF3_IMPLEMENTATION_PACKET_2026_08_16.md");
const studio = read("public/index.html");
const room = read("public/library.html");
const sw = read("public/sw.js");
const server = read("server.js");
const locales = ["ru", "en", "he"].map((code) => [code, read(`public/i18n/locales/${code}.js`)]);

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  return source.slice(start, end > start ? end : start + 8000);
}

test("VF3 records the only remaining approved slice and exact stop boundary", () => {
  assert.match(packet, /Status: `VF3_[A-Z0-9_]+`/);
  assert.match(packet, /VF2_CLOSED_OWNER_ACCEPTED/);
  assert.match(packet, /only remaining approved slice/i);
  assert.match(packet, /No VF4 is authorized/);
  assert.match(packet, /446-inline-style backlog/);
  assert.match(packet, /physical mobile and assistive technology remain `NOT_RUN`/i);
});

test("VF3 Studio icon enhancement is fallback-first and static-read-only", () => {
  assert.match(studio, /const STUDIO_ICON_SPRITE = ['"]\/icons\/linguistpro-ui\.svg['"]/);
  assert.match(studio, /function ensureStudioIconSprite\(/);
  assert.match(studio, /function hydrateStudioIcons\(/);
  assert.match(studio, /function studioIconSlot\(/);
  const helper = studio.slice(studio.indexOf("const STUDIO_ICON_SPRITE"), studio.indexOf("function v3ThemeGet"));
  assert.match(helper, /fetch\(STUDIO_ICON_SPRITE,\s*\{\s*cache:\s*['"]force-cache['"]/);
  assert.match(helper, /studio-icon-fallback/);
  assert.doesNotMatch(helper, /(?:POST|PUT|PATCH|DELETE)|\/api\/|localStorage|indexedDB|ensureLocalDB|sendBeacon/i);
});

test("VF3 shell uses the approved icon subset without emoji-owned names", () => {
  for (const symbol of [
    "lp-mark-studio", "lp-mark-room", "lp-icon-train", "lp-icon-theme",
    "lp-icon-search", "lp-icon-note", "lp-icon-info", "lp-icon-settings",
    "lp-icon-chevron-left",
  ]) assert.match(studio, new RegExp(`data-studio-icon="${symbol}"`), `missing Studio shell icon ${symbol}`);
  assert.match(studio, /class="v3-ide-header-logo"[\s\S]*data-studio-icon="lp-mark-studio"[\s\S]*data-i18n="ide\.logoTitle"/);
  assert.match(studio, /id="v3IdeRoomBtn"[^>]*>[\s\S]*data-studio-icon="lp-mark-room"[\s\S]*data-i18n="ide\.readingRoom"/);
  assert.match(studio, /id="v3ModeToggle"[^>]*>[\s\S]*data-studio-icon="lp-mark-studio"[\s\S]*data-i18n="classic\.ideMode"/);
  assert.doesNotMatch(studio, /id="v3IdeRoomBtn"[^>]*data-i18n="ide\.readingRoom"/,
    "i18n must update the label span without replacing the icon slot");
  const mode = extractFunction(studio, "v3IdeApplyMode", "v3IdeCloseAllModals");
  assert.match(mode, /syncStudioModeToggle\(true\)/);
  assert.match(mode, /syncStudioModeToggle\(false\)/);
  assert.doesNotMatch(mode, /toggleBtn\.textContent/,
    "mode switching must not erase the fallback-first icon slot");
});

test("VF3 focus, motion and non-motion shell contracts are explicit", () => {
  assert.match(studio, /\.studio-vf3-focus,\s*\n\.studio-vf3-shell \.studio-vf3-focus\s*\{/,
    "the shell-specific selector must outrank the legacy IDE 150ms transition");
  assert.match(studio, /\.studio-vf3-focus:focus-visible[\s\S]*var\(--lp-focus-ring\)/);
  assert.match(studio, /\.studio-vf3-shell[\s\S]*var\(--lp-font-ui\)/);
  assert.match(studio, /var\(--lp-motion-hover\)/);
  assert.match(studio, /var\(--lp-motion-continuity\)/);
  assert.match(studio, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.v3-ide-spinner[\s\S]*animation:\s*none/);
  assert.match(studio, /@media \(forced-colors: active\)[\s\S]*\.studio-vf3-focus:focus-visible/);
});

test("VF3 presentational state kinds remain downstream of existing writers", () => {
  assert.match(studio, /id="classicNextStep"[^>]*class="[^"]*lp-state[^"]*"[^>]*data-kind="info"/);
  assert.match(studio, /id="studioReviewState"[^>]*data-kind="neutral"/);
  const classic = extractFunction(studio, "classicSyncStateUi");
  assert.match(classic, /classicNextStepEl\.dataset\.kind\s*=/);
  const review = extractFunction(studio, "refreshStudioReviewStatus", "v3OpenRoomReview");
  assert.match(review, /state\.dataset\.kind\s*=/);
  assert.doesNotMatch(review, /review_log|updateWordStatus|fetch\s*\(/,
    "VF3 may classify existing presentation but cannot gain a review writer");
});

test("VF3 shell locale labels are emoji-free and symmetric", () => {
  for (const [code, source] of locales) {
    for (const key of ["ideMode", "library", "inspector", "dashboard", "train", "readingRoom", "classic"]) {
      assert.match(source, new RegExp(`${key}:\\s*["'][^"'\\n]+["']`), `${code} missing ${key}`);
    }
    const shell = source.slice(source.indexOf("classic: {"), source.indexOf("review: {"));
    assert.doesNotMatch(shell.match(/ideMode:[^\n]+|library:[^\n]+|inspector:[^\n]+|dashboard:[^\n]+|train:[^\n]+|readingRoom:[^\n]+|classic:[^\n]+|light:[^\n]+|dark:[^\n]+|auto:[^\n]+/g)?.join("\n") || "", /\p{Extended_Pictographic}/u,
      `${code} Studio-shell labels must not own emoji identity/status`);
  }
});

test("VF3 release and exact shared locale assets are locked to 3.11.398", () => {
  const app = studio.match(/window\.APP_VERSION\s*=\s*"([^"]+)"/);
  const footer = room.match(/id="roomFooterVersion"[^>]*>v([^<]+)</);
  const worker = sw.match(/const CACHE_VERSION\s*=\s*"v([^"]+)"/);
  assert.ok(app && footer && worker);
  assert.equal(app[1], "3.11.398");
  assert.equal(footer[1], app[1]);
  assert.equal(worker[1], app[1]);
  for (const code of ["ru", "en", "he"]) {
    const url = `/i18n/locales/${code}.js?v=168`;
    assert.ok(studio.includes(url), `Studio must request exact ${url}`);
    assert.ok(room.includes(url), `Room must request exact ${url}`);
    assert.ok(sw.includes(JSON.stringify(url)), `SW must precache exact ${url}`);
    assert.ok(server.includes(JSON.stringify(url)), `integrity manifest must key exact ${url}`);
  }
});
