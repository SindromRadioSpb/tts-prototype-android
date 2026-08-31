#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const AdmZip = require("adm-zip");

const ROOT = path.resolve(__dirname, "..", "..");
const TABLE_ROOT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "artifacts", "student-solution-tables");
const DEFAULT_ANCHOR = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "production-publication-anchor.json");
const DEFAULT_RIGHTS = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "publication-rights-attestation.json");
const DEFAULT_OUTPUT = path.join(ROOT, "materials", "pb2-support");
const DEFAULT_BUNDLE = path.join(ROOT, ".tmp", "materials-pb2-q043-rebake.zip");
const SLUG = "materials-science-year1-problem-book-2";
const HASH = /^[a-f0-9]{64}$/;

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const stableJson = value => JSON.stringify(value, null, 2) + "\n";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
function invariant(value, message) { if (!value) throw new Error(message); }
function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2), value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `MISSING_ARG:${key}`);
    result[key] = value; index += 1;
  }
  return result;
}
function validateRights(rights, { fullTts = false } = {}) {
  invariant(rights?.schema_version === "materials_pb2_publication_rights.1.0.0", "RIGHTS_SCHEMA_INVALID");
  invariant(rights.corpus_slug === SLUG && rights.owner_attested === true && String(rights.basis || "").trim(), "RIGHTS_ATTESTATION_MISSING");
  for (const key of ["source_text_and_diagrams", "generated_learning_columns", "independent_solutions", "bilingual_solution_derivatives", "public_read", "public_solution_display_and_print"])
    invariant(rights.classes?.[key] === true, `RIGHTS_CLASS_NOT_COVERED:${key}`);
  if (fullTts) invariant(rights.classes.full_tts_audio_and_timings === true, "FULL_TTS_RIGHTS_REQUIRED");
  else {
    invariant(rights.classes?.public_stream_current_zero_audio_edition === true, "RIGHTS_CLASS_NOT_COVERED:public_stream_current_zero_audio_edition");
    invariant(rights.classes.full_tts_audio_and_timings === false, "FULL_TTS_MUST_REMAIN_DEFERRED");
  }
  return Object.freeze({
    public_read_allowed: true,
    public_solution_display_and_print_allowed: true,
    package_download_allowed: rights.classes.package_download === true,
    agent_derivative_text_allowed: rights.classes.agent_derivative_text === true,
    full_tts_audio_and_timings_allowed: fullTts,
    basis: rights.basis,
    asserted_at: rights.asserted_at
  });
}
function assetMime(extension) {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  throw new Error(`SOURCE_ASSET_TYPE_NOT_ALLOWED:${extension}`);
}
function build({ anchorPath = DEFAULT_ANCHOR, rightsPath = DEFAULT_RIGHTS, bundlePath = DEFAULT_BUNDLE, ttsManifestPath, output = DEFAULT_OUTPUT } = {}) {
  const tableManifest = readJson(path.join(TABLE_ROOT, "manifest.json"));
  const anchor = readJson(anchorPath);
  const ttsManifestBytes = ttsManifestPath ? fs.readFileSync(path.resolve(ttsManifestPath)) : null;
  const ttsManifest = ttsManifestBytes ? JSON.parse(ttsManifestBytes.toString("utf8")) : null;
  const fullTts = !!ttsManifest;
  const rights = validateRights(readJson(rightsPath), { fullTts });
  invariant(tableManifest.corpus_slug === SLUG && tableManifest.tasks.length === 60, "TABLE_MANIFEST_INVALID");
  invariant(anchor.schema_version === "materials_pb2_production_publication_anchor.1.0.0" && anchor.corpus_slug === SLUG
    && anchor.items?.length === 60 && HASH.test(anchor.edition?.manifest_sha256), "PUBLICATION_ANCHOR_INVALID");
  const anchorByTask = new Map(anchor.items.map(item => [item.task_id, item]));
  invariant(anchorByTask.size === 60, "PUBLICATION_ANCHOR_TASK_DUPLICATE");
  const zip = new AdmZip(path.resolve(bundlePath));
  let ttsRefs = null, ttsAssets = null;
  if (fullTts) {
    invariant(ttsManifest.schema_version === "materials_pb2_public_tts_assets.1.0.0" && ttsManifest.corpus_slug === SLUG
      && ttsManifest.profile_id && Array.isArray(ttsManifest.assets) && Array.isArray(ttsManifest.references)
      && Array.isArray(ttsManifest.word_index), "TTS_MANIFEST_INVALID");
    ttsAssets = new Map(ttsManifest.assets.map(asset => [asset.asset_key, asset]));
    invariant(ttsAssets.size === ttsManifest.assets.length && [...ttsAssets.values()].every(asset => HASH.test(String(asset.asset_key || ""))
      && ["row", "word"].includes(asset.asset_type)), "TTS_ASSET_INDEX_INVALID");
    ttsRefs = new Map(ttsManifest.references.map(ref => [`${ref.task_id}:${ref.row_id}`, ref]));
    invariant(ttsRefs.size === ttsManifest.references.length, "TTS_ROW_REFERENCE_DUPLICATE");
  }
  const staging = `${path.resolve(output)}.staging-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  const taskOutput = path.join(staging, "tasks");
  const assetOutput = path.join(staging, "assets");
  fs.mkdirSync(taskOutput, { recursive: true });
  fs.mkdirSync(assetOutput, { recursive: true });
  const files = [];
  const assets = new Map();
  for (const entry of tableManifest.tasks) {
    const table = readJson(path.join(TABLE_ROOT, entry.file));
    const pinned = anchorByTask.get(entry.task_id);
    invariant(pinned && pinned.source_canonical_task_sha256 === entry.canonical_task_sha256
      && HASH.test(String(pinned.canonical_task_sha256 || "")), `ANCHOR_TASK_DRIFT:${entry.task_id}`);
    const condition = clone(table.condition);
    if (fullTts) condition.rows = condition.rows.map(row => {
      const ref = ttsRefs.get(`${entry.task_id}:${row.row_id}`);
      invariant(ref?.source_kind === "condition" && ttsAssets.get(ref.asset_key)?.asset_type === "row", `TTS_CONDITION_REFERENCE_MISSING:${row.row_id}`);
      return { ...row, audio_asset_key: ref.asset_key, audio_tts_profile: ttsManifest.profile,
        audio_plan: { state: "READY", synthesis_field: "hebrew_niqqud", spoken_he_niqqud: ref.spoken_he_niqqud,
          tts_profile: ttsManifest.profile, timings_present: true, timing_url: `/api/audio/${ref.asset_key}/timing` } };
    });
    condition.source_assets = (condition.source_assets || []).map(sourceAsset => {
      invariant(HASH.test(String(sourceAsset.sha256 || "")) && Number(sourceAsset.bytes) > 0, `SOURCE_ASSET_CONTRACT_INVALID:${entry.task_id}`);
      const archivePath = String(sourceAsset.path || "").replaceAll("\\", "/");
      const zipEntry = zip.getEntry(archivePath);
      invariant(zipEntry && !zipEntry.isDirectory, `SOURCE_ASSET_MISSING:${archivePath}`);
      const data = zipEntry.getData();
      invariant(data.length === Number(sourceAsset.bytes) && sha256(data) === sourceAsset.sha256, `SOURCE_ASSET_DRIFT:${archivePath}`);
      const extension = path.extname(archivePath).toLowerCase();
      const file = `assets/${sourceAsset.sha256}${extension}`;
      const mime = assetMime(extension);
      if (!assets.has(sourceAsset.sha256)) {
        fs.writeFileSync(path.join(staging, file), data);
        assets.set(sourceAsset.sha256, { sha256: sourceAsset.sha256, bytes: data.length, mime, file });
      } else invariant(assets.get(sourceAsset.sha256).bytes === data.length && assets.get(sourceAsset.sha256).mime === mime, `SOURCE_ASSET_HASH_COLLISION:${sourceAsset.sha256}`);
      return { ...sourceAsset, public_url: `/api/public-corpora/${SLUG}/learning-support/assets/${sourceAsset.sha256}` };
    });
    const support = {
      schema_version: "materials_pb2_learning_support.1.0.0",
      corpus_slug: SLUG,
      edition_id: anchor.edition.edition_id,
      edition_number: Number(anchor.edition.edition_number),
      edition_manifest_sha256: anchor.edition.manifest_sha256,
      edition_item_id: pinned.edition_item_id,
      public_work_id: pinned.public_work_id,
      snapshot_sha256: pinned.snapshot_sha256,
      task_id: table.task_id,
      display_alias: table.display_alias,
      source_anchor: table.source_anchor,
      publication_anchor: { canonical_task_sha256: pinned.canonical_task_sha256, source_canonical_task_sha256: pinned.source_canonical_task_sha256 },
      review: table.review,
      condition,
      solution_rows: fullTts ? table.rows.map(row => {
        const ref = ttsRefs.get(`${entry.task_id}:${row.row_id}`);
        invariant(ref?.source_kind === "solution" && ttsAssets.get(ref.asset_key)?.asset_type === "row", `TTS_SOLUTION_REFERENCE_MISSING:${row.row_id}`);
        return { ...row, audio_plan: { ...row.audio_plan, state: "READY", audio_asset_key: ref.asset_key,
          spoken_he_niqqud: ref.spoken_he_niqqud, tts_profile: ttsManifest.profile,
          timings_present: true, timing_url: `/api/audio/${ref.asset_key}/timing` } };
      }) : table.rows,
      agent_grounding: table.agent_grounding,
      render_contract: table.render_contract,
      audio_boundary: {
        full_tts_generated: fullTts,
        timing_sidecars_present: fullTts,
        row_karaoke_contract_checked: true,
        profile_id: fullTts ? ttsManifest.profile_id : null,
        profile: fullTts ? ttsManifest.profile : null,
        formula_speech_review_required_count: table.rows.filter(row => row.audio_plan.formula_speech_review_required).length
      },
      rights
    };
    const file = `tasks/${entry.task_id}.json`;
    const bytes = Buffer.from(stableJson(support), "utf8");
    fs.writeFileSync(path.join(staging, file), bytes);
    files.push({
      task_id: entry.task_id,
      canonical_task_sha256: pinned.canonical_task_sha256,
      source_canonical_task_sha256: pinned.source_canonical_task_sha256,
      edition_item_id: pinned.edition_item_id,
      public_work_id: pinned.public_work_id,
      snapshot_sha256: pinned.snapshot_sha256,
      position_no: Number(pinned.position_no),
      file,
      bytes: bytes.length,
      sha256: sha256(bytes)
    });
  }
  files.sort((a, b) => a.position_no - b.position_no);
  const manifest = {
    schema_version: "materials_pb2_learning_support_manifest.1.0.0",
    corpus_slug: SLUG,
    edition: anchor.edition,
    rights,
    review: { task_count: 60, publication_blocking_count: 0, open_mismatch_count: 0 },
    audio_boundary: fullTts ? { ...tableManifest.audio_boundary, full_tts_generated: true,
      audio_asset_count: ttsManifest.assets.length,
      timing_sidecar_count: ttsManifest.assets.filter(asset => asset.asset_type === "row").length,
      profile_id: ttsManifest.profile_id } : tableManifest.audio_boundary,
    public_tts: fullTts ? {
      schema_version: "materials_pb2_public_tts_reference.1.0.0", profile_id: ttsManifest.profile_id,
      profile: ttsManifest.profile, asset_manifest_sha256: sha256(ttsManifestBytes),
      assets: ttsManifest.assets.map(asset => ({ asset_key: asset.asset_key, asset_type: asset.asset_type,
        bytes: asset.bytes, sha256: asset.sha256, timing: asset.timing })),
      word_index: ttsManifest.word_index,
    } : undefined,
    student_table_manifest_sha256: sha256(fs.readFileSync(path.join(TABLE_ROOT, "manifest.json"))),
    assets: [...assets.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)),
    tasks: files
  };
  const bytes = Buffer.from(stableJson(manifest), "utf8");
  fs.writeFileSync(path.join(staging, "manifest.json"), bytes);
  fs.rmSync(path.resolve(output), { recursive: true, force: true });
  fs.renameSync(staging, path.resolve(output));
  return { task_count: files.length, asset_count: assets.size, edition: manifest.edition, output: path.resolve(output), manifest_sha256: sha256(bytes) };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = build({
    anchorPath: args.anchor ? path.resolve(args.anchor) : DEFAULT_ANCHOR,
    rightsPath: args.rights ? path.resolve(args.rights) : DEFAULT_RIGHTS,
    bundlePath: args.bundle ? path.resolve(args.bundle) : DEFAULT_BUNDLE,
    ttsManifestPath: args["tts-manifest"] ? path.resolve(args["tts-manifest"]) : undefined,
    output: args.output ? path.resolve(args.output) : DEFAULT_OUTPUT
  });
  process.stdout.write(stableJson({ ok: true, ...result }));
}
if (require.main === module) try { main(); } catch (error) { process.stderr.write(`build-materials-pb2-runtime-support: ${error.stack || error.message}\n`); process.exitCode = 1; }
module.exports = { build, validateRights };
