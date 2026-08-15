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
  assert.match(roomHtml, /\.mentor-status-line\.lp-state/);
  assert.match(roomHtml, /\.mentor-vf2-focus:focus-visible/);
  assert.match(roomHtml, /var\(--lp-motion-hover\)/);
  assert.match(roomHtml, /@media \(forced-colors: active\)[\s\S]*mentor-vf2-focus/);
});

test("VF2 release lock cache-busts every changed shared asset and precaches the exact URLs", () => {
  assert.match(roomHtml, /\/css\/reader-core\.css\?v=393/);
  assert.match(roomHtml, /\/css\/reader-morph\.css\?v=393/);
  assert.match(studioHtml, /\/css\/reader-morph\.css\?v=393/);
  assert.match(roomHtml, /\/js\/mentor-home\.js\?v=393/);
  assert.match(roomHtml, /\/js\/library-ui\.js\?v=393/);
  for (const url of [
    "/css/reader-core.css?v=393",
    "/css/reader-morph.css?v=393",
    "/js/mentor-home.js?v=393",
    "/js/library-ui.js?v=393",
  ]) assert.ok(sw.includes(JSON.stringify(url)), `${url} must be offline-precached exactly`);
});
