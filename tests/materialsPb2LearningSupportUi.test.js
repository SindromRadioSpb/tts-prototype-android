"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

test("Materials PB2 Room exposes reviewed condition and solution tables without claiming full TTS", () => {
  const room = read("public/js/library-ui.js"), html = read("public/library.html"), server = read("server.js"), worker = read("public/sw.js");
  assert.match(room, /renderMaterialsLearningActions/);
  assert.match(room, /materials-science-year1-problem-book-2[\s\S]*renderMaterialsLearningActions/);
  assert.match(room, /materialsLearningTable\(materialsConditionRows\(support\), 'condition'\)/);
  assert.match(room, /materialsLearningTable\(support\.solution_rows, 'solution'\)/);
  assert.match(room, /materialsPrintStudy/);
  assert.match(room, /materialsPrintExam/);
  assert.match(room, /materialsAudioDeferred/);
  assert.doesNotMatch(room, /generateMaterials.*TTS|materials.*synthesize/i);
  assert.match(html, /@page materials-study[\s\S]*A4 landscape/);
  assert.match(html, /@page materials-exam[\s\S]*A4 portrait/);
  assert.match(html, /data-print-mode="exam"[\s\S]*materials-niqqud-cell/);
  assert.match(html, /@media \(max-width: 480px\)[\s\S]*materials-learning-table td::before/);
  assert.match(server, /MATERIALS_PB2_LEARNING_SUPPORT_PUBLIC_READ/);
  assert.match(server, /configured === "0"[\s\S]*loadMaterialsPb2LearningSupportManifest\(\)/,
    "runtime support must auto-enable only after its validated exact-edition manifest is installed, while retaining a kill switch");
  assert.match(server, /learning-support\/assets\/:assetSha256/);
  assert.match(worker, /learningSupport = \/\\\/works/);
});

test("Materials PB2 learning surface is localized in all Room locales", () => {
  for (const locale of ["ru", "en", "he"]) {
    const dictionary = read(`public/i18n/locales/${locale}.js`);
    for (const key of ["materialsLearningTitle", "materialsPrintStudy", "materialsPrintExam", "materialsAudioDeferred", "materialsNiqqud", "materialsOpenSolution"])
      assert.ok(dictionary.includes(key + ":"), `${locale}: ${key}`);
  }
});

test("Materials PB2 adapter accepts only sequential karaoke-token plans pinned to the edition", () => {
  const adapter = require("../public/js/public-corpus-adapter.js");
  const catalog = adapter.normalizeCorpus({
    corpus: { corpus_id: "pc-materials", slug: "materials-science-year1-problem-book-2", title: "Materials" },
    edition: { edition_id: "ed-materials", edition_number: 1, manifest_sha256: "a".repeat(64), item_count: 1, asset_count: 0, asset_missing: 0, package_complete: true },
    items: [{ public_work_id: "materials-work-1", position_no: 1, title: "Task 1", snapshot_sha256: "b".repeat(64), public_read_allowed: 1, public_stream_allowed: 0, package_download_allowed: 0, expected_audio_count: 0, included_audio_count: 0, asset_missing: 0, package_complete: 1 }],
  });
  const item = catalog.items[0];
  const row = index => ({ row_id: `materials-science-y1-pb2-q001-sol-r00${index + 1}`, order: index + 1, section: "answer_first", kind: "final_answer", source_refs: ["source"], text: { he: "תשובה", he_niqqud: "תְּשׁוּבָה", transliteration: "tshuva", ru: "ответ" }, audio_plan: { state: "DEFERRED_UNTIL_OWNER_CARD_REVIEW", timings_present: false, karaoke_tokens: [{ index: 0, surface: "תשובה", normalized: "תשובה" }] } });
  const payload = { schema_version: "materials_pb2_learning_support.1.0.0", corpus_slug: catalog.slug, edition_id: catalog.edition.edition_id, edition_number: 1, edition_manifest_sha256: catalog.edition.manifest_sha256, public_work_id: item.public_work_id, snapshot_sha256: item.snapshot_sha256, task_id: "materials-science-y1-pb2-q001", derivative_sha256: "c".repeat(64), review: { state: "REVIEWED_PASS", publication_blocking: false }, rights: { public_read_allowed: true, public_solution_display_and_print_allowed: true }, audio_boundary: { full_tts_generated: false }, condition: { rows: [{ russian: "Условие", hebrew_plain: "שאלה", hebrew_niqqud: "שְׁאֵלָה", translit: "sheela" }], source_pages: [3], source_assets: [] }, solution_rows: [0,1,2,3].map(row) };
  assert.equal(adapter.normalizeMaterialsLearningSupport(payload, catalog, item).solution_rows.length, 4);
  const broken = JSON.parse(JSON.stringify(payload)); broken.solution_rows[0].audio_plan.karaoke_tokens[0].index = 2;
  assert.throws(() => adapter.normalizeMaterialsLearningSupport(broken, catalog, item), /PUBLIC_CORPUS_PAYLOAD_INVALID/);
});
