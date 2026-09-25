"use strict";

// R5b (UI release program; owner D6 «целиком», 2026-09-26 — supersedes the VF font/accent freeze):
// one accent — tekhelet #1B4FB8 (dark #7FA6F5) — in Studio, Room and Mediatheque, and Golos Text
// as the interface font, self-hosted (COEP require-corp blocks CDNs) and precached for offline use.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const SUBSETS = ["cyrillic-ext", "cyrillic", "latin-ext", "latin"];

test("Golos Text is self-hosted with its licence, declared per subset and precached", () => {
  const vf = read("public/css/visual-foundations.css");
  const sw = read("public/sw.js");
  assert.ok(fs.existsSync(path.join(ROOT, "public/fonts/golos-text/OFL.txt")), "SIL OFL 1.1 travels with the files");
  for (const s of SUBSETS) {
    const file = `/fonts/golos-text/golos-text-${s}.woff2`;
    assert.ok(fs.existsSync(path.join(ROOT, "public" + file)), file);
    assert.match(vf, new RegExp(`@font-face \\{[^}]*font-family: "Golos Text";[^}]*url\\("${file.replace(/\//g, "\\/")}"\\) format\\("woff2"\\);[^}]*unicode-range:`));
    assert.match(sw, new RegExp(`"${file.replace(/\//g, "\\/")}",`), "precached: " + file);
  }
  assert.doesNotMatch(vf, /fonts\.gstatic|fonts\.googleapis/);
  assert.match(vf, /--lp-font-ui: "Golos Text", /);
});

test("every shell uses the interface font, and form controls inherit it", () => {
  assert.match(read("public/index.html"), /    body \{\n        font-family: var\(--lp-font-ui\);/);
  assert.match(read("public/library.html"), /body \{ font-family: var\(--lp-font-ui\); \}/);
  const ml = read("public/css/mediatheque.css");
  assert.match(ml, /font-family:"Golos Text",/);
  assert.match(ml, /@font-face\{font-family:"Golos Text"/);
  assert.match(read("public/css/visual-foundations.css"), /:where\(button, input, select, textarea\) \{ font-family: inherit; \}/);
});

test("one accent: tekhelet in the token sources of all three shells", () => {
  const vf = read("public/css/visual-foundations.css");
  const studio = read("public/index.html");
  for (const src of [vf, studio]) {
    assert.match(src, /--theme-accent: #1b4fb8;/i);
    assert.match(src, /--theme-accent-hover: #123a8a;/i);
    assert.match(src, /--theme-accent: #7fa6f5;/i, "dark accent");
  }
  const room = read("public/library.html");
  assert.match(room, /--accent: #1b4fb8;/i);
  assert.match(room, /--accent: #7fa6f5;/i);
  const ml = read("public/css/mediatheque.css");
  assert.match(ml, /--ml-accent:#1b4fb8/i);
  assert.match(ml, /--ml-accent:#7fa6f5/i);
});

test("the old blues are gone from the shells and shared styles", () => {
  // iphone-downloader.css ships inside the separately built, owner-qualified iPhone helper package.
  const files = ["public/index.html", "public/library.html", "public/mediatheque.html",
    ...fs.readdirSync(path.join(ROOT, "public/css")).filter((f) => f.endsWith(".css") && f !== "iphone-downloader.css").map((f) => "public/css/" + f)];
  for (const f of files) {
    const src = read(f);
    for (const hex of ["#2563eb", "#1565c0", "#3498db", "#2358a8"]) {
      assert.ok(!src.toLowerCase().includes(hex), `${f} still uses ${hex}`);
    }
  }
});
