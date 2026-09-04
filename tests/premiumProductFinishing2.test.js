"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const studio = read("public/index.html");
const room = read("public/library.html");
const sw = read("public/sw.js");
const packet = read("docs/planning/ROOM_UX_PREMIUM_PRODUCT_FINISHING_2_IMPLEMENTATION_PACKET_2026_08_19.md");

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function ruleBody(source, selectorPattern) {
  const match = source.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing rule ${selectorPattern}`);
  return match[1];
}

test("PPF2 implementation is bound to the exact owner approval and stop list", () => {
  assert.match(packet, /Status: `CLOSED_OWNER_ACCEPTED_PRODUCTION_3\.11\.404`/);
  assert.match(packet, /P1=ACCESSIBILITY_NECESSITY_ONLY;/);
  assert.match(packet, /P3=ONE_CONTRAST_SLICE_PPF2_01_TO_04_BACKLOG_PPF2_05_06;/);
  assert.match(packet, /SCOPE=EXACT_PPF2_CONTRAST_ALLOWLIST_ONLY;/);
  assert.match(packet, /No authority is granted for `PPF2-05`, `PPF2-06`/);
});

test("PPF2-01 uses the existing Library secondary role only on Journey explanatory text", () => {
  assert.match(room, /\.learning-home-journey-types\s*\{\s*margin-top:\s*3px;\s*color:\s*var\(--text-secondary\);\s*\}/);
  assert.doesNotMatch(room, /\.learning-home-journey-types\s*\{\s*margin-top:\s*3px;\s*color:\s*var\(--text-faint\)/);
});

test("PPF2-02..04 use the approved Studio semantic colors without global token changes", () => {
  const classic = ruleBody(studio, "\\.classic-next-step-label");
  const onboarding = ruleBody(studio, "\\.v3-onb-features-title");
  const footerVersion = ruleBody(studio, "\\.app-footer-version");
  const footerCredit = ruleBody(studio, "\\.app-footer-credit");
  assert.match(classic, /color:\s*var\(--theme-text-secondary\);/);
  assert.match(onboarding, /color:\s*#475569;/,
    "the fixed-white onboarding island uses the existing light secondary value");
  assert.match(footerVersion, /color:\s*var\(--theme-text-secondary\);/);
  assert.match(footerCredit, /color:\s*var\(--theme-text-secondary\);/);
  assert.doesNotMatch(classic, /!important/);
});

test("approved semantic foregrounds meet AA on every exact light background", () => {
  const secondary = "#475569";
  for (const [name, background] of Object.entries({
    libraryJourney: "#f7f4f1",
    studioNextStep: "#eff6ff",
    studioOnboarding: "#ffffff",
    studioFooter: "#f4f6f9",
  })) {
    assert.ok(contrast(secondary, background) >= 4.5,
      `${name} secondary text must meet 4.5:1`);
  }
});

test("current release keeps Studio Room and service worker at one version", () => {
  assert.match(studio, /window\.APP_VERSION\s*=\s*"3\.11\.471"/);
  assert.match(room, /id="roomFooterVersion"[^>]*>v3\.11\.471<\/button>/);
  assert.match(sw, /const CACHE_VERSION\s*=\s*"v3\.11\.471"/);
});
