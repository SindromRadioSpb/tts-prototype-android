"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));
const read = (relative) => exists(relative)
  ? fs.readFileSync(path.join(ROOT, relative), "utf8")
  : "";

const FILES = Object.freeze({
  css: "public/css/visual-foundations.css",
  sprite: "public/icons/linguistpro-ui.svg",
  license: "public/icons/lucide-LICENSE.txt",
  provenance: "public/icons/linguistpro-ui.PROVENANCE.md",
  packet: "docs/planning/ROOM_UX_VISUAL_FINISHING_IMPLEMENTATION_PACKET_2026_08_15.md",
});

const indexHtml = read("public/index.html");
const libraryHtml = read("public/library.html");
const serviceWorker = read("public/sw.js");
const css = read(FILES.css);
const sprite = read(FILES.sprite);
const license = read(FILES.license);
const provenance = read(FILES.provenance);
const packet = read(FILES.packet);

const SYSTEM_SYMBOLS = Object.freeze([
  "lp-icon-sync",
  "lp-icon-theme",
  "lp-icon-search",
  "lp-icon-settings",
  "lp-icon-play",
  "lp-icon-pause",
  "lp-icon-stop",
  "lp-icon-audio",
  "lp-icon-bookmark",
  "lp-icon-note",
  "lp-icon-list-add",
  "lp-icon-train",
  "lp-icon-info",
  "lp-icon-success",
  "lp-icon-warning",
  "lp-icon-error",
  "lp-icon-loading",
  "lp-icon-chevron-left",
  "lp-icon-chevron-right",
  "lp-icon-chevron-down",
  "lp-icon-chevron-up",
  "lp-icon-close",
  "lp-icon-offline",
]);

const FIRST_PARTY_SYMBOLS = Object.freeze([
  "lp-mark-product",
  "lp-mark-room",
  "lp-mark-studio",
  "lp-mark-mentor",
]);

const LIGHT_THEME_SOURCE = Object.freeze({
  "theme-bg-page": "#f4f6f9",
  "theme-bg-card": "#ffffff",
  "theme-bg-elevated": "#ffffff",
  "theme-bg-muted": "#f8fafc",
  "theme-bg-hover": "#f1f5f9",
  "theme-text-primary": "#0f172a",
  "theme-text-secondary": "#475569",
  "theme-text-muted": "#64748b",
  "theme-text-faint": "#94a3b8",
  "theme-border-soft": "#e2e8f0",
  "theme-border-medium": "#cbd5e1",
  "theme-border-strong": "#94a3b8",
  "theme-accent": "#2563eb",
  "theme-accent-hover": "#1d4ed8",
  "theme-accent-soft": "#eff6ff",
  "theme-success": "#16a34a",
  "theme-success-soft": "#dcfce7",
  "theme-warning": "#d97706",
  "theme-warning-soft": "#fef3c7",
  "theme-danger": "#dc2626",
  "theme-danger-soft": "#fef2f2",
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function declarationsFor(selector) {
  const match = css.match(new RegExp(`${escapeRegex(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `missing CSS declaration block for ${selector}`);
  return match[1];
}

function colorValue(block, name) {
  const match = block.match(new RegExp(`--${escapeRegex(name)}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  assert.ok(match, `missing six-digit color --${name}`);
  return match[1];
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("VF0 creates only the approved additive foundation assets", () => {
  for (const relative of Object.values(FILES)) {
    assert.ok(exists(relative), `missing approved VF0 file: ${relative}`);
  }
  assert.match(packet, /Status: `VF[0-3]_[A-Z0-9_]+`/);
  assert.match(packet, /Owner approval: `Рекомендации утверждаю\. Стартуй`/);
  assert.match(packet, /SCOPE=BOUNDED_VISUAL_FINISHING_ONLY/);
  assert.match(packet, /VF1 Room shell\/L0\/corpora \| `CLOSED_OWNER_ACCEPTED`/);
  assert.match(packet, /VF3 Studio shell \| `CLOSED_OWNER_ACCEPTED` \| final `3\.11\.398`/);
  assert.match(packet, /The approved `SERIALIZED_VF0_VF3_ALLOWLIST` is exhausted/);
});

test("VF0 loads foundations before legacy surface styles and leaves the fallbacks in place", () => {
  const link = '<link rel="stylesheet" href="/css/visual-foundations.css">';
  const studioLink = indexHtml.indexOf(link);
  const studioLegacy = indexHtml.indexOf("<style>");
  const roomLink = libraryHtml.indexOf(link);
  const roomReader = libraryHtml.indexOf('<link rel="stylesheet" href="/css/reader-core.css?v=399">');
  const roomLegacy = libraryHtml.indexOf("<style>");

  assert.ok(studioLink >= 0 && studioLink < studioLegacy,
    "Studio must load additive foundations before its complete legacy fallback");
  assert.ok(roomLink >= 0 && roomLink < roomReader && roomReader < roomLegacy,
    "Room must load foundations before Reader and its complete local fallback");
  assert.match(indexHtml, /<style>[\s\S]*--theme-bg-page:\s*#f4f6f9/,
    "Studio fallback tokens stay intact for the compatibility release");
  assert.match(libraryHtml, /<style>[\s\S]*--bg-page:\s*#f4f6f9/,
    "Room fallback tokens stay intact for the compatibility release");
});

test("VF0 foundation aliases the established Studio palette instead of creating a second truth", () => {
  for (const [name, value] of Object.entries(LIGHT_THEME_SOURCE)) {
    const declaration = new RegExp(`--${escapeRegex(name)}:\\s*${escapeRegex(value)}\\s*;`);
    assert.match(indexHtml, declaration, `Studio source token ${name} drifted`);
    assert.match(css, declaration, `foundation token ${name} must start as a byte-equivalent source value`);
  }

  for (const alias of [
    "lp-surface-page", "lp-surface-card", "lp-text-primary", "lp-text-secondary",
    "lp-border-soft", "lp-accent", "lp-focus-ring", "bg-page", "bg-card",
    "text-primary", "text-secondary", "border-soft", "accent",
  ]) {
    assert.match(css, new RegExp(`--${alias}:`), `missing compatibility alias --${alias}`);
  }
});

test("VF0 exposes the approved typography, geometry, status, focus and motion roles", () => {
  for (const token of [
    "lp-font-ui", "lp-font-editorial", "lp-font-hebrew-ui", "lp-font-hebrew-reading",
    "lp-space-1", "lp-space-2", "lp-space-3", "lp-space-4", "lp-space-6", "lp-space-8",
    "lp-radius-8", "lp-radius-10", "lp-radius-12", "lp-radius-16", "lp-radius-pill",
    "lp-elevation-0", "lp-elevation-sm", "lp-elevation-md", "lp-elevation-overlay",
    "lp-motion-instant", "lp-motion-hover", "lp-motion-continuity", "lp-motion-disclosure", "lp-motion-overlay",
  ]) {
    assert.match(css, new RegExp(`--${token}:`), `missing foundation token --${token}`);
  }

  for (const kind of ["neutral", "info", "success", "warning", "error"]) {
    for (const role of ["fg", "bg", "border", "icon"]) {
      assert.match(css, new RegExp(`--lp-status-${kind}-${role}:`),
        `missing status role --lp-status-${kind}-${role}`);
    }
  }

  assert.match(css, /\.lp-focus-ring:focus-visible\s*\{/);
  assert.match(css, /\.lp-icon\s*\{/);
  assert.match(css, /\.lp-state\s*\{/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*--lp-motion-hover:\s*0ms[\s\S]*\.lp-icon--spin[\s\S]*animation:\s*none/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.lp-focus-ring:focus-visible/);
});

test("VF0 stays additive and low-specificity", () => {
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /@layer\b/);
  assert.doesNotMatch(css, /@font-face|url\s*\(\s*["']?https?:/i,
    "VF0 must not add a font or network dependency");
  assert.doesNotMatch(cssWithoutComments, /^\s*(?:\*|html|body)(?:\s|,|\{)/m,
    "VF0 must not restyle global elements or introduce a reset");
  assert.doesNotMatch(css, /\.(?:work-card|room-|reader-|classic-|v3-|mentor-|trainer-)/,
    "surface components remain surface-owned");
});

test("VF0 semantic statuses meet text and non-text contrast in light and dark palettes", () => {
  const palettes = [declarationsFor(":root"), declarationsFor("body.theme-dark")];
  for (const block of palettes) {
    for (const kind of ["neutral", "info", "success", "warning", "error"]) {
      const background = colorValue(block, `lp-status-${kind}-bg`);
      const foreground = colorValue(block, `lp-status-${kind}-fg`);
      const icon = colorValue(block, `lp-status-${kind}-icon`);
      assert.ok(contrastRatio(foreground, background) >= 4.5,
        `${kind} status text must meet WCAG 2.2 AA contrast`);
      assert.ok(contrastRatio(icon, background) >= 3,
        `${kind} status icon must meet non-text contrast`);
    }
  }
  assert.ok(contrastRatio("#2563eb", "#ffffff") >= 3, "light focus ring must contrast with cards");
  assert.ok(contrastRatio("#93c5fd", "#1e293b") >= 3, "dark focus ring must contrast with cards");
});

test("VF0 sprite is a bounded, inert and complete audited symbol set", () => {
  assert.ok(Buffer.byteLength(sprite, "utf8") <= 18000, "sprite exceeds the 18 KB VF0 budget");
  assert.match(sprite, /^<svg\b[\s\S]*<\/svg>\s*$/);
  assert.match(sprite, /stroke="currentColor"/);
  assert.doesNotMatch(sprite, /<(?:script|foreignObject|text|image)\b/i);
  assert.doesNotMatch(sprite, /\b(?:href|src)\s*=|url\s*\(/i);
  assert.doesNotMatch(sprite, /<style\b|on[a-z]+\s*=/i);

  const actual = [...sprite.matchAll(/<symbol\s+id="([^"]+)"/g)].map((match) => match[1]).sort();
  const expected = [...SYSTEM_SYMBOLS, ...FIRST_PARTY_SYMBOLS].sort();
  assert.deepEqual(actual, expected, "sprite IDs must equal the approved set; no generic pack dump");
  assert.equal(SYSTEM_SYMBOLS.length, 23, "system subset remains within the approved 16–24 range");
});

test("VF0 records Lucide and Feather licence notices plus reproducible provenance", () => {
  assert.match(license, /ISC License/);
  assert.match(license, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
  assert.match(license, /The MIT License \(MIT\)/);
  assert.match(license, /Copyright \(c\) 2013-present Cole Bemis/);
  assert.match(provenance, /Lucide `1\.27\.0`/);
  assert.match(provenance, /`4aec3f892fd6c23063bc2fead83c899b5d412b1c`/);
  assert.match(provenance, /Source repository: `https:\/\/github\.com\/lucide-icons\/lucide`/);
  assert.match(provenance, /Upstream licence blob SHA-256: `b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57`/);
  assert.equal(
    crypto.createHash("sha256").update(Buffer.from(license.replace(/\r\n/g, "\n"), "utf8")).digest("hex"),
    "b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57",
    "normalized licence content must match the pinned upstream Git blob",
  );

  const sourceRows = [...provenance.matchAll(/`icons\/([^`]+\.svg)` \| `([A-Fa-f0-9]{64})`/g)];
  assert.equal(sourceRows.length, SYSTEM_SYMBOLS.length,
    "every vendored system symbol needs one exact upstream source hash");
  assert.equal(new Set(sourceRows.map((row) => row[1])).size, SYSTEM_SYMBOLS.length,
    "provenance must not duplicate or omit an upstream icon source");
});

test("VF0 precaches foundation assets and remains locked to the current served release", () => {
  assert.match(serviceWorker, /"\/css\/visual-foundations\.css"/);
  assert.match(serviceWorker, /"\/icons\/linguistpro-ui\.svg"/);

  const app = indexHtml.match(/window\.APP_VERSION\s*=\s*"([^"]+)"/);
  const room = libraryHtml.match(/id="roomFooterVersion"[^>]*>v([^<]+)</);
  const worker = serviceWorker.match(/const CACHE_VERSION\s*=\s*"v([^"]+)"/);
  assert.ok(app && room && worker, "all public version surfaces must exist");
  assert.equal(app[1], "3.11.400");
  assert.equal(room[1], app[1]);
  assert.equal(worker[1], app[1]);
});
