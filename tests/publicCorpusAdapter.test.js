"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const source = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const adapter = require("../public/js/public-corpus-adapter.js");

test("public corpus adapter validates catalog facts and builds stable deep links", () => {
  const corpus = adapter.normalizeCorpus({ corpus: { corpus_id: "pc_1", slug: "study-songs", title: "Study Songs" }, edition: { edition_id: "ed_1", manifest_sha256: "a".repeat(64), item_count: 1, asset_count: 2, asset_missing: 0, package_complete: true }, items: [{ public_work_id: "work-1", position_no: 1, title: "שיר", creator: "מחבר", snapshot_sha256: "c".repeat(64), public_read_allowed: 1, public_stream_allowed: 1, package_download_allowed: 1, expected_audio_count: 2, included_audio_count: 2, asset_missing: 0, package_complete: 1 }] });
  assert.equal(corpus.slug, "study-songs");
  assert.equal(corpus.items[0].capabilities.read, true);
  assert.equal(corpus.items[0].capabilities.stream, true);
  assert.equal(corpus.items[0].capabilities.download, true);
  assert.equal(adapter.deepLink("study-songs", "work-1"), "/library.html?public_corpus=study-songs&public_work=work-1");
});

test("public work materialization strips protected markers and pins immutable provenance", () => {
  const payload = { corpus: { corpus_id: "pc_1", slug: "study-songs", title: "Study Songs" }, edition: { edition_id: "ed_1", edition_number: 1, manifest_sha256: "b".repeat(64) }, item: { public_work_id: "work-1", position_no: 1, title: "Song", snapshot_sha256: "c".repeat(64), public_read_allowed: 1, public_stream_allowed: 1, package_download_allowed: 1, expected_audio_count: 1, included_audio_count: 1, asset_missing: 0, package_complete: 1, snapshot: { library: { texts: [{ text_key: "song-key", title: "Song", source_meta_json: JSON.stringify({ group_corpus: { corpus_id: "private" }, other: "kept" }), rows: [{ order_index: 0, audio_asset_key: "d".repeat(64) }] }] } } }, assets: [{ asset_key: "d".repeat(64), bytes: 4, sha256: "d".repeat(64), public_stream_allowed: 1, package_download_allowed: 1 }] };
  const bundle = adapter.prepareImportBundle(payload);
  const meta = bundle.library.texts[0].source_meta;
  assert.equal(bundle.library.texts[0].source_meta_json, undefined);
  assert.equal(meta.group_corpus, undefined);
  assert.deepEqual(meta.public_corpus, { slug: "study-songs", corpus_id: "pc_1", edition_id: "ed_1", public_work_id: "work-1", manifest_sha256: "b".repeat(64), snapshot_sha256: "c".repeat(64) });
  assert.equal(bundle.library.texts[0].text_key, "public:study-songs:work-1:" + "c".repeat(12));
  assert.equal(bundle.library.texts[0].rows[0].audio_asset_key, "d".repeat(64));
});

test("anonymous route source has no session, CSRF, audit or write call", () => {
  const server = source("server.js");
  const start = server.indexOf("// MASS_ACCESS_I4_PUBLIC_READ_BEGIN");
  const end = server.indexOf("// MASS_ACCESS_I4_PUBLIC_READ_END");
  assert.ok(start >= 0 && end > start);
  const block = server.slice(start, end);
  for (const route of ["/api/public-corpora", "/learning-index", "/works", "/assets/", "/package"]) assert.ok(block.includes(route), route);
  assert.doesNotMatch(block, /requireUser|requireCsrf|identityRepo\.audit|\.(?:run|exec)\s*\(|\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.match(block, /getPublicCorpus|getPublicLearningIndex|getPublicWork|getPublicAsset|getPublicPackage/);
});

test("public Study Songs has an unambiguous localized display name without changing its slug", () => {
  for (const [locale, title] of [["ru", "Публичные учебные песни"], ["en", "Public Study Songs"], ["he", "שירי לימוד ציבוריים"]]) {
    const dictionary = source(`public/i18n/locales/${locale}.js`);
    assert.ok(dictionary.includes(`studySongsTitle:"${title}"`), `${locale} public title`);
  }
  const room = source("public/js/library-ui.js");
  assert.match(room, /authorizedCorpusById\('public:' \+ slug\)/);
});

test("Room loads public corpora before protected memberships and uses the public audio transport", () => {
  const room = source("public/js/library-ui.js");
  const html = source("public/library.html");
  assert.match(room, /loadPublicCorpora\(\)/);
  assert.match(room, /renderPublicCorpus/);
  assert.match(room, /openPublicCorpusWork/);
  assert.match(room, /readerPublicCorpusSlug/);
  assert.match(room, /\/api\/public-corpora\/.*\/assets\//);
  assert.match(html, /public-corpus-adapter\.js/);
});

test("service worker answers audio Range requests from a cached full immutable asset", () => {
  const worker = source("public/sw.js");
  assert.match(worker, /req\.headers\.get\("range"\)/);
  assert.match(worker, /fetch\(fullRequest\)/);
  assert.match(worker, /cache\.put\(fullRequest, fullResponse\.clone\(\)\)/);
  assert.match(worker, /status:\s*206/);
  assert.match(worker, /Content-Range/);
});
