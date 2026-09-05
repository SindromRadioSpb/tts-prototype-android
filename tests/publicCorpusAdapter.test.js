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
  assert.equal(bundle.library.texts[0].title, "Song", "published card title replaces source operator labels");
});

test("anonymous route source has no session, CSRF, audit or write call", () => {
  const server = source("server.js");
  const start = server.indexOf("// MASS_ACCESS_I4_PUBLIC_READ_BEGIN");
  const end = server.indexOf("// MASS_ACCESS_I4_PUBLIC_READ_END");
  assert.ok(start >= 0 && end > start);
  const block = server.slice(start, end);
  for (const route of ["/api/public-corpora", "/learning-index", "/works", "/learning-support", "/assets/", "/package"]) assert.ok(block.includes(route), route);
  assert.doesNotMatch(block, /requireUser|requireCsrf|identityRepo\.audit|\.(?:run|exec)\s*\(|\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.match(block, /getPublicCorpus|getPublicLearningIndex|getPublicWork|getPublicAsset|getPublicPackage/);
  assert.match(block, /resolvePhysicsLearningSupport/);
  assert.match(server, /PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ[^\n]+=== "1"/);
});

test("public Study Songs has an unambiguous localized display name without changing its slug", () => {
  for (const [locale, title] of [["ru", "Публичные учебные песни"], ["en", "Public Study Songs"], ["he", "שירי לימוד ציבוריים"]]) {
    const dictionary = source(`public/i18n/locales/${locale}.js`);
    assert.ok(dictionary.includes(`studySongsTitle:"${title}"`), `${locale} public title`);
  }
  const room = source("public/js/library-ui.js");
  assert.match(room, /authorizedCorpusById\('public:' \+ slug\)/);
});

test("shared public-corpus controls stay material-generic for non-song corpora", () => {
  const expected = {
    ru: ['search:"Найти материал или автора"', 'scopeCreator:"Только автор"', 'audioFilterLabel:"Аудио"'],
    en: ['search:"Find a material or author"', 'scopeCreator:"Author only"', 'audioFilterLabel:"Audio"'],
    he: ['search:"חיפוש חומר או מחבר"', 'scopeCreator:"מחבר בלבד"', 'audioFilterLabel:"שמע"'],
  };
  for (const [locale, fragments] of Object.entries(expected)) {
    const dictionary = source(`public/i18n/locales/${locale}.js`);
    for (const fragment of fragments) assert.ok(dictionary.includes(fragment), `${locale}: ${fragment}`);
  }
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

test("Physics section and resource projections remain pinned to the immutable catalog", () => {
  const catalog = adapter.normalizeCorpus({
    corpus: { corpus_id: "pc-physics", slug: "physics-year1-problems", title: "Physics" },
    edition: { edition_id: "ed-2", edition_number: 2, manifest_sha256: "a".repeat(64), item_count: 1, asset_count: 0, asset_missing: 0, package_complete: true },
    items: [{ public_work_id: "physics-year1-task-1-1", position_no: 1, title: "Физика — задача 1.1", snapshot_sha256: "b".repeat(64), public_read_allowed: 1, public_stream_allowed: 1, package_download_allowed: 1, expected_audio_count: 0, included_audio_count: 0, asset_missing: 0, package_complete: 1 }],
  });
  const sections = adapter.normalizePhysicsSections({ schema_version: "physics_sections.1.0.0", slug: catalog.slug, sections: [{
    section_no: 1, title_ru: "Глава 1", title_en: "Chapter 1", title_he: "פרק 1", task_count: 1,
    tasks: [{ public_work_id: "physics-year1-task-1-1", position_no: 1, task_number: "1.1", title: "Физика — задача 1.1", snapshot_sha256: "b".repeat(64) }],
  }] }, catalog);
  assert.equal(sections[0].task_count, 1);
  const resources = adapter.normalizePhysicsResourceIndex({ schema_version: "physics_task_resource_index.1.0.0", slug: catalog.slug, resources: [{
    resource_id: "ptr_1", revision_id: "prv_1", revision_no: 1, edition_id: "ed-2", public_work_id: "physics-year1-task-1-1",
    work_snapshot_sha256: "b".repeat(64), resource_kind: "PDF", content_kind: "CONDITION_AND_SOLUTION", title: "Условие и решение 1.1",
    language: "MULTI", bytes: 1200, sha256: "c".repeat(64), mime: "application/pdf", quality_status: "ORIGINAL", public_read_allowed: true,
    agent_read_allowed: false, file_url: "/api/public-corpora/physics-year1-problems/resources/prv_1/file",
  }] }, catalog);
  assert.equal(resources[0].edition_id, "ed-2");
  assert.throws(() => adapter.normalizePhysicsResourceIndex({ schema_version: "physics_task_resource_index.1.0.0", slug: catalog.slug, resources: [{ ...resources[0], work_snapshot_sha256: "d".repeat(64) }] }, catalog), /PUBLIC_CORPUS_PAYLOAD_INVALID/);
});

test("Physics learning support accepts only the exact reviewed edition, work and snapshot", () => {
  const manifest = JSON.parse(source("physics/year1-support/manifest.json"));
  const entry = manifest.tasks[0];
  const payload = JSON.parse(source(`physics/year1-support/${entry.file}`));
  const catalog = adapter.normalizeCorpus({
    corpus: { corpus_id: "pc_physics", slug: manifest.corpus_slug, title: "Physics" },
    edition: { edition_id: manifest.edition.edition_id, edition_number: manifest.edition.edition_number, manifest_sha256: manifest.edition.manifest_sha256,
      item_count: 1, asset_count: 0, asset_missing: 0, package_complete: true },
    items: [{ public_work_id: entry.public_work_id, position_no: 1, title: `Физика — задача ${entry.task_number}`,
      snapshot_sha256: entry.snapshot_sha256, public_read_allowed: 1, public_stream_allowed: 0, package_download_allowed: 0,
      expected_audio_count: 0, included_audio_count: 0, asset_missing: 0, package_complete: 1 }],
  });
  const item = catalog.items[0];
  const runtimePayload = { ...payload, derivative_sha256: entry.sha256 };
  const support = adapter.normalizePhysicsLearningSupport(runtimePayload, catalog, item);
  assert.equal(support.task_number, entry.task_number);
  assert.equal(support.answer.result.length > 0, true);
  assert.equal(support.exam_solution.calculation.length > 0, true);
  assert.throws(() => adapter.normalizePhysicsLearningSupport({ ...runtimePayload, snapshot_sha256: "f".repeat(64) }, catalog, item), /PUBLIC_CORPUS_PAYLOAD_INVALID/);
});

test("Physics Room surface is section-first, localized and exposes an in-product PDF viewer", () => {
  const room = source("public/js/library-ui.js");
  const html = source("public/library.html");
  assert.match(room, /ensurePhysicsPublicEnhancement/);
  assert.match(room, /physics-section-nav/);
  assert.match(room, /physics-section-list'[\s\S]*role: 'group'/);
  assert.doesNotMatch(room, /type: 'button', role: 'listitem'/);
  assert.match(room, /wrap\.insertBefore\(sectionNav, guest\)/);
  assert.match(room, /physics\.taskByWork|get\(item\.public_work_id\)/);
  assert.match(room, /openPhysicsResourceViewer/);
  assert.match(room, /readerTaskResources/);
  assert.match(html, /id="readerTaskResources"/);
  assert.match(html, /@media \(max-width: 480px\)[\s\S]*\.physics-section-list \{ grid-template-columns: 1fr;/);
  for (const locale of ["ru", "en", "he"]) {
    const dictionary = source(`public/i18n/locales/${locale}.js`);
    for (const key of ["physicsSectionsTitle", "physicsConditionSolution", "physicsTaskMaterials"]) assert.ok(dictionary.includes(key + ":"), `${locale}: ${key}`);
  }
});

test("service worker answers audio Range requests from a cached full immutable asset", () => {
  const worker = source("public/sw.js");
  assert.match(worker, /req\.headers\.get\("range"\)/);
  assert.match(worker, /fetch\(fullRequest\)/);
  assert.match(worker, /cache\.put\(fullRequest, fullResponse\.clone\(\)\)/);
  assert.match(worker, /status:\s*206/);
  assert.match(worker, /Content-Range/);
});

test("service worker leaves immutable task-resource PDFs network-only", () => {
  const worker = source("public/sw.js");
  const publicBlock = worker.slice(
    worker.indexOf('url.pathname.startsWith("/api/public-corpora")'),
    worker.indexOf('// All other /api/*')
  );
  assert.match(publicBlock, /resources\\\/\[A-Za-z0-9_.:-\]\+\\\/file/);
  assert.match(publicBlock, /if \(\/\\\/resources/);
  assert.match(publicBlock, /file\$\/\.test\(url\.pathname\)\) return/);
});
