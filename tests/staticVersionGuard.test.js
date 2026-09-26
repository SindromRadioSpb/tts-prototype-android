"use strict";

// O-019: during a rolling deploy the old container answered the NEW ?v= URLs with OLD bytes,
// cached for a day under the new key (the first R7 live run saw «song, idf, lyrics» under
// ru.js?v=258). A build now serves a versioned URL cacheably only for the ?v= it shipped.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parsePrecacheVersions, cacheBustMismatch } = require("../release/staticVersionGuard");

test("the shipped versions come from the service worker's precache list", () => {
  const sw = 'const PRECACHE_URLS = [\n  "/",\n  "/css/app-nav.css?v=653",\n  "/i18n/locales/ru.js?v=264",\n  "/icons/linguistpro-ui.svg",\n];';
  const map = parsePrecacheVersions(sw);
  assert.equal(map.get("/css/app-nav.css"), "653");
  assert.equal(map.get("/i18n/locales/ru.js"), "264");
  assert.equal(map.has("/icons/linguistpro-ui.svg"), false, "unversioned URLs are not guarded");
});

test("only a ?v= this build did not ship is a mismatch", () => {
  const map = new Map([["/i18n/locales/ru.js", "264"]]);
  assert.equal(cacheBustMismatch(map, "/i18n/locales/ru.js", "265"), true, "newer key from an old container");
  assert.equal(cacheBustMismatch(map, "/i18n/locales/ru.js", "250"), true, "an older key this build no longer ships");
  assert.equal(cacheBustMismatch(map, "/i18n/locales/ru.js", "264"), false);
  assert.equal(cacheBustMismatch(map, "/i18n/locales/ru.js", undefined), false, "no ?v= → normal policy");
  assert.equal(cacheBustMismatch(map, "/js/other.js", "1"), false, "paths outside the precache list keep their policy");
});

test("the server answers a mismatched ?v= with no-store before any cache policy", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(server, /const STATIC_SHIPPED_VERSIONS = parsePrecacheVersions\(fs\.readFileSync\(path\.join\(__dirname, "public", "sw\.js"\), "utf8"\)\);/);
  const i = server.indexOf('app.use(express.static(path.join(__dirname, "public"), {');
  const block = server.slice(i, i + 900);
  assert.match(block, /cacheBustMismatch\(STATIC_SHIPPED_VERSIONS, res\.req && res\.req\.path, res\.req && res\.req\.query && res\.req\.query\.v\)[\s\S]{0,120}res\.setHeader\("Cache-Control", "no-store"\);\s*return;/);
});
