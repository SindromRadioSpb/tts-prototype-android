"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");

const ROOT = path.resolve(__dirname, "..");
const TABLE_ROOT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "artifacts", "student-solution-tables");
const BUNDLE = path.join(ROOT, ".tmp", "materials-pb2-q043-rebake.zip");
const SLUG = "materials-science-year1-problem-book-2";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const stableJson = value => JSON.stringify(value, null, 2) + "\n";
const canonicalize = value => Array.isArray(value) ? value.map(canonicalize) : (!value || typeof value !== "object") ? value : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
const canonicalHash = value => sha256(JSON.stringify(canonicalize(value)));
const writeJson = (file, value) => fs.writeFileSync(file, stableJson(value));

function syntheticFixture(root) {
  const tableManifest = JSON.parse(fs.readFileSync(path.join(TABLE_ROOT, "manifest.json"), "utf8"));
  const edition = { edition_id: "materials-pb2-test-edition", edition_number: 1, manifest_sha256: "a".repeat(64) };
  const zip = new AdmZip(BUNDLE), library = JSON.parse(zip.readAsText("library/library.json"));
  const publishedHashByTask = new Map(library.texts.map(text => [text.source_meta.materials_science_task.task_id, canonicalHash(text)]));
  const anchor = {
    schema_version: "materials_pb2_production_publication_anchor.1.0.0", corpus_slug: SLUG, edition,
    items: tableManifest.tasks.map((task, index) => ({
      task_id: task.task_id, canonical_task_sha256: publishedHashByTask.get(task.task_id), source_canonical_task_sha256: task.canonical_task_sha256,
      edition_item_id: `materials-pb2-test-item-${index + 1}`,
      public_work_id: `materials-pb2-test-work-${index + 1}`,
      snapshot_sha256: sha256(`materials-pb2-test-snapshot-${index + 1}`), position_no: index + 1,
    })),
  };
  const rights = {
    schema_version: "materials_pb2_publication_rights.1.0.0", corpus_slug: SLUG,
    owner_attested: true, basis: "SYNTHETIC_TEST_FIXTURE_NOT_PUBLICATION_AUTHORITY", asserted_at: "2026-08-30T00:00:00Z",
    classes: {
      source_text_and_diagrams: true, generated_learning_columns: true, independent_solutions: true,
      bilingual_solution_derivatives: true, public_read: true, public_solution_display_and_print: true,
      public_stream_current_zero_audio_edition: true,
      package_download: false, agent_derivative_text: true, full_tts_audio_and_timings: false,
    },
  };
  const anchorPath = path.join(root, "anchor.json"), rightsPath = path.join(root, "rights.json"), output = path.join(root, "support");
  writeJson(anchorPath, anchor); writeJson(rightsPath, rights);
  return { anchor, anchorPath, rights, rightsPath, output, tableManifest };
}

test("Materials PB2 runtime is exact-edition bound, carries reviewed tables and serves hash-pinned source figures", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-support-"));
  try {
    const fixture = syntheticFixture(temp);
    const { build } = require("../scripts/premium/build-materials-pb2-runtime-support.js");
    const result = build({ anchorPath: fixture.anchorPath, rightsPath: fixture.rightsPath, bundlePath: BUNDLE, output: fixture.output });
    assert.equal(result.task_count, 60);
    assert.equal(result.asset_count, 72);
    const manifest = JSON.parse(fs.readFileSync(path.join(fixture.output, "manifest.json"), "utf8"));
    assert.equal(manifest.review.publication_blocking_count, 0);
    assert.equal(manifest.audio_boundary.full_tts_generated, false);
    assert.equal(manifest.assets.length, 72);

    const zip = new AdmZip(BUNDLE);
    const library = JSON.parse(zip.readAsText("library/library.json"));
    const canonical = library.texts[0];
    const pinned = fixture.anchor.items[0];
    const resolver = require("../materials/materialsPb2LearningSupport.js").createResolver(fixture.output);
    const support = resolver.resolveLearningSupport({
      slug: SLUG, editionId: fixture.anchor.edition.edition_id, editionNumber: 1,
      editionManifestSha256: fixture.anchor.edition.manifest_sha256, editionItemId: pinned.edition_item_id,
      publicWorkId: pinned.public_work_id, snapshotSha256: pinned.snapshot_sha256,
      snapshot: { library: { texts: [canonical] } },
    });
    assert.equal(support.task_id, fixture.tableManifest.tasks[0].task_id);
    assert.equal(support.solution_rows.length > 10, true);
    const markdown = require("../materials/materialsPb2LearningSupport.js").toAgentMarkdown(support);
    assert.match(markdown, /Каноническое условие на русском/);
    assert.match(markdown, /Проверенное решение/);
    assert.match(markdown, new RegExp(support.snapshot_sha256));
    for (const row of support.solution_rows) assert.ok(markdown.includes(row.text.ru), `missing reviewed row ${row.row_id}`);
    assert.ok(Buffer.byteLength(markdown, "utf8") <= require("../materials/materialsPb2LearningSupport.js").MAX_AGENT_MARKDOWN_BYTES);
    assert.match(support.condition.source_assets[0].public_url, /\/learning-support\/assets\/[a-f0-9]{64}$/);
    const asset = resolver.resolveAsset(support.condition.source_assets[0].sha256);
    assert.equal(asset.bytes, support.condition.source_assets[0].bytes);
    assert.equal(fs.existsSync(asset.absolute_path), true);
    assert.throws(() => resolver.resolveLearningSupport({
      slug: SLUG, editionId: fixture.anchor.edition.edition_id, editionNumber: 1,
      editionManifestSha256: fixture.anchor.edition.manifest_sha256, editionItemId: pinned.edition_item_id,
      publicWorkId: pinned.public_work_id, snapshotSha256: "f".repeat(64), snapshot: { library: { texts: [canonical] } },
    }), /MATERIALS_PB2_LEARNING_SUPPORT_NOT_FOUND/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("all 60 production Materials PB2 derivatives fit the immutable MCP Markdown envelope", () => {
  const runtime = require("../materials/materialsPb2LearningSupport.js");
  const manifest = runtime.loadManifest();
  assert.equal(manifest.tasks.length, 60);
  let maximum = 0;
  for (const entry of manifest.tasks) {
    const body = JSON.parse(fs.readFileSync(path.join(runtime.DEFAULT_ROOT, entry.file), "utf8"));
    const markdown = runtime.toAgentMarkdown({ ...body, derivative_sha256: entry.sha256 });
    const bytes = Buffer.byteLength(markdown, "utf8");
    maximum = Math.max(maximum, bytes);
    assert.ok(bytes <= runtime.MAX_AGENT_MARKDOWN_BYTES, `${entry.task_id} exceeds MCP output envelope`);
    for (const row of body.solution_rows) assert.ok(markdown.includes(row.text.ru), `${entry.task_id} dropped ${row.row_id}`);
    assert.doesNotMatch(markdown, /karaoke_tokens|audio_asset_key|timing_sidecars/);
  }
  assert.ok(maximum > 1000);
});

test("Materials PB2 agent-rights plan grants only discovery and reviewed derivative text", () => {
  const manifest = require("../materials/materialsPb2LearningSupport.js").loadManifest();
  const { buildFacts } = require("../scripts/premium/apply-materials-pb2-agent-rights.js");
  const discover = buildFacts(manifest, "DISCOVER");
  const derivative = buildFacts(manifest, "DERIVATIVE_TEXT");
  assert.equal(discover.length, 60);
  assert.equal(derivative.length, 60);
  assert.deepEqual(new Set([...discover, ...derivative].map(row => row.useClass)), new Set(["DISCOVER", "DERIVATIVE_TEXT"]));
  assert.throws(() => buildFacts(manifest, "SOURCE_BINARY"), /USE_CLASS_INVALID/);
});

test("Materials PB2 rights validator refuses full TTS and incomplete content-class authority", () => {
  const { validateRights } = require("../scripts/premium/build-materials-pb2-runtime-support.js");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-rights-"));
  try {
    const fixture = syntheticFixture(temp);
    assert.throws(() => validateRights({ ...fixture.rights, classes: { ...fixture.rights.classes, full_tts_audio_and_timings: true } }), /FULL_TTS_MUST_REMAIN_DEFERRED/);
    assert.throws(() => validateRights({ ...fixture.rights, classes: { ...fixture.rights.classes, independent_solutions: false } }), /RIGHTS_CLASS_NOT_COVERED:independent_solutions/);
    assert.throws(() => validateRights({ ...fixture.rights, classes: { ...fixture.rights.classes, public_stream_current_zero_audio_edition: false } }), /RIGHTS_CLASS_NOT_COVERED:public_stream_current_zero_audio_edition/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
