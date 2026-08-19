const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const packet = read("docs/planning/ROOM_UX_VISUAL_FINISHING_VF2_IMPLEMENTATION_PACKET_2026_08_15.md");
const readerCss = read("public/css/reader-core.css");
const readerJs = read("public/js/reader-core.js");
const morphCss = read("public/css/reader-morph.css");
const mentor = read("public/js/mentor-home.js");
const roomJs = read("public/js/library-ui.js");
const roomHtml = read("public/library.html");
const studioHtml = read("public/index.html");
const sw = read("public/sw.js");
const server = read("server.js");

test("VF2 records the serialized authority and exact compatibility boundary", () => {
  assert.match(packet, /Status: `VF2_[A-Z0-9_]+`/);
  assert.match(packet, /exact `VF1 PROD=PASS`/);
  assert.match(packet, /Reader table layout and builder markup remain byte-parity locked with Studio/);
  assert.match(packet, /physical mobile and assistive technology remain `NOT_RUN`/i);
});

test("VF2 Reader adopts shared focus and motion without changing the parity builder", () => {
  assert.match(readerCss, /var\(--lp-motion-hover\)/);
  assert.match(readerCss, /var\(--lp-motion-continuity\)/);
  assert.match(readerCss, /box-shadow:\s*0 0 0 3px var\(--lp-focus-ring\)/);
  assert.match(readerCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*v3AudioPrefetchPulse/);
  assert.match(readerCss, /@media \(forced-colors: active\)/);
  assert.match(readerJs, /actionTitle defaults to "▶📝"/,
    "VF2 keeps the shared Reader action-column contract; parity is gated separately");
});

test("VF2 Morph uses foundation aliases and bounded overlay motion", () => {
  assert.match(morphCss, /--bg-card:\s*var\(--theme-bg-card\)/);
  assert.match(morphCss, /transition:\s*transform var\(--lp-motion-overlay\) var\(--lp-ease-standard\)/);
  assert.match(morphCss, /box-shadow:\s*0 0 0 3px var\(--lp-focus-ring\)/);
  assert.match(morphCss, /@media \(forced-colors: active\)/);
});

test("VF2 Mentor icons are host-provided, fallback-first and semantically silent", () => {
  assert.match(roomJs, /icon:\s*\(symbol, fallback, className\)\s*=>\s*roomIcon\(symbol, fallback, className\)/);
  assert.match(mentor, /function visualIcon\(symbol, fallback, className\)/);
  assert.match(mentor, /S\.host && typeof S\.host\.icon === "function"/);
  assert.match(mentor, /setAttribute\("aria-hidden", "true"\)/);
  assert.match(mentor, /lp-mark-mentor/);
  assert.match(mentor, /lp-icon-play/);
  assert.match(mentor, /lp-icon-audio/);
  assert.doesNotMatch(mentor, /fetch\(["']\/icons\/linguistpro-ui\.svg/,
    "the portable Mentor module must not create a second sprite/network owner");
});

test("VF2 Mentor CSS uses the shared state, focus, motion and forced-colors grammar", () => {
  assert.match(roomHtml, /<h2 class="reader-title"><span data-room-icon="lp-mark-mentor" aria-hidden="true">[\s\S]*<span data-i18n="room\.mentor\.title">Наставник<\/span><\/h2>/,
    "the Mentor view identity must expose localized text while its product mark stays silent");
  assert.doesNotMatch(roomHtml, /<h2[^>]*data-i18n="room\.mentor\.title"[^>]*>\s*🤖/,
    "generic i18n replacement must not restore an emoji-only Mentor heading");
  assert.match(roomHtml, /\.mentor-status-line\.lp-state/);
  assert.match(roomHtml, /\.mentor-vf2-focus:focus-visible/);
  assert.match(roomHtml, /var\(--lp-motion-hover\)/);
  assert.match(roomHtml, /@media \(forced-colors: active\)[\s\S]*mentor-vf2-focus/);
});

test("VF2 release lock cache-busts every changed shared asset and precaches the exact URLs", () => {
  assert.match(roomHtml, /\/css\/reader-core\.css\?v=399/);
  assert.match(roomHtml, /\/css\/reader-morph\.css\?v=394/);
  assert.match(studioHtml, /\/css\/reader-morph\.css\?v=394/);
  assert.match(roomHtml, /\/js\/mentor-connection-core\.js\?v=414/);
  assert.match(roomHtml, /\/js\/mentor-home\.js\?v=414/);
  assert.match(roomHtml, /\/js\/library-ui\.js\?v=414/);
  for (const url of [
    "/js/reader-core.js?v=399",
    "/css/reader-core.css?v=399",
    "/css/reader-morph.css?v=394",
    "/js/mentor-connection-core.js?v=414",
    "/js/mentor-home.js?v=414",
    "/js/library-ui.js?v=414",
  ]) {
    assert.ok(sw.includes(JSON.stringify(url)), `${url} must be offline-precached exactly`);
    assert.ok(server.includes(JSON.stringify(url)), `${url} must use the identical integrity-manifest key`);
  }
  assert.match(server, /new URL\(url, "http:\/\/linguistpro\.local"\)\.pathname/,
    "cache-bust queries must not become part of the filesystem path used for hashing");
  for (const locale of ["ru", "en", "he"]) {
    const url = `/i18n/locales/${locale}.js?v=174`;
    assert.ok(sw.includes(JSON.stringify(url)), `${url} must be offline-precached exactly`);
    assert.ok(server.includes(JSON.stringify(url)), `${url} must use the identical integrity-manifest key`);
  }
});
