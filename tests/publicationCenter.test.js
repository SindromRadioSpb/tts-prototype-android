"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("Publication Center API delegates every write to the publication repository", () => {
  const server = read("server.js");
  for (const route of [
    "/api/publication/corpora",
    "/api/publication/corpora/:corpusId/draft/items:copy",
    "/api/publication/corpora/:corpusId/draft/items:reorder",
    "/api/publication/corpora/:corpusId/draft/rights:apply-study-songs-preset",
    "/api/publication/corpora/:corpusId/draft:validate",
    "/api/publication/corpora/:corpusId:publish",
    "/api/publication/corpora/:corpusId:withdraw",
    "/api/publication/corpora/:corpusId:restore",
    "/api/publication/corpora/:corpusId:rollback",
    "/api/publication/corpora/:corpusId/draft:new-revision",
  ]) assert.ok(server.replaceAll("\\\\:", ":").includes(route), `missing route ${route}`);
  assert.match(server, /getPublicationRepo\(\)/);
  assert.match(server, /requireStrictSameOriginJson/);
  assert.match(server, /X-Idempotency-Key/i);
  assert.doesNotMatch(server, /api\/publication[\s\S]{0,2000}(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?published_/i);
});

test("Publication Center is the single Studio writer and Room links to it", () => {
  const studio = read("public/index.html");
  const room = read("public/js/library-ui.js");
  const center = read("public/js/publication-center.js");
  assert.match(studio, /id="publicationCenterDialog"/);
  assert.match(studio, /publication-center\.js/);
  assert.match(center, /OWNER_ATTESTATION_2026_08_20/);
  assert.match(center, /2026-08-20/);
  assert.match(center, /\/api\/publication\/corpora/);
  assert.match(room, /index\.html#publication-center/);
  assert.doesNotMatch(room, /fetch\([^\n]*\/api\/publication[^\n]*method\s*:\s*["']POST/i);
});

test("Publication Center ships localized, responsive, accessible controls", () => {
  const css = read("public/css/publication-center.css");
  const center = read("public/js/publication-center.js");
  const studio = read("public/index.html");
  assert.match(css, /@media\s*\(max-width:\s*480px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\[dir=["']rtl["']\]/);
  assert.match(studio, /id="pcStatus"[^>]*aria-live="polite"/);
  for (const locale of ["ru", "en", "he"]) {
    const source = read(`public/i18n/locales/${locale}.js`);
    assert.match(source, new RegExp(`I18N_LOCALES\\.${locale}\\.publication\\s*=`));
    assert.match(source, /peter@kolosei\.com/);
  }
});
