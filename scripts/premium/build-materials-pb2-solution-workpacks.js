#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "docs",
  "research",
  "materials-science-problem-solutions",
  "2026-08-30",
  "solution-batches"
);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

function taskProjection(text) {
  const source = text.source_meta?.materials_science_task;
  if (!source?.task_id || source.task_id !== text.text_key) throw new Error(`Task identity drift: ${text.text_key}`);
  return {
    task_id: text.text_key,
    title: text.title,
    display_alias: source.display_alias,
    source_pages: source.source_pages,
    source_pdf_sha256: source.source_pdf_sha256,
    verification_status: source.verification_status,
    visual_requirement: source.visual_requirement,
    semantic_visuals: source.semantic_visuals,
    external_reference_dependencies: source.external_reference_dependencies,
    source_assets: source.source_assets,
    rows: text.rows.map((row) => ({
      row_id: row.row_id,
      order_index: row.order_index,
      kind: row.meta?.materials_science?.kind,
      source_page: row.meta?.materials_science?.source_page,
      he: row.hebrew_plain,
      he_niqqud: row.hebrew_niqqud,
      transliteration: row.translit,
      ru: row.russian,
      canonical_provenance: row.meta?.materials_science?.canonical_provenance
    }))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bundle) throw new Error("Usage: --bundle <canonical-learning.zip> [--output-dir <stable-dir>]");
  const outputDir = path.resolve(args["output-dir"] || DEFAULT_OUTPUT);
  const bundleBytes = fs.readFileSync(args.bundle);
  const zip = await JSZip.loadAsync(bundleBytes);
  const manifestBytes = await zip.file("manifest.json")?.async("nodebuffer");
  const libraryBytes = await zip.file("library/library.json")?.async("nodebuffer");
  if (!manifestBytes || !libraryBytes) throw new Error("Canonical bundle is missing manifest or library");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const library = JSON.parse(libraryBytes.toString("utf8"));
  if (library.texts.length !== 60 || manifest.text_count !== 60) throw new Error("Expected exactly 60 canonical tasks");

  fs.mkdirSync(outputDir, { recursive: true });
  const outputs = [];
  for (let start = 0; start < library.texts.length; start += 10) {
    const batchNumber = start / 10 + 1;
    const batchId = `B${String(batchNumber).padStart(2, "0")}`;
    const payload = {
      schema: "linguistpro.materials-pb2.independent-solution-source-workpack.1",
      status: "SOURCE_ONLY_READY_FOR_INDEPENDENT_DERIVATION_NO_LEGACY_SOLUTIONS_INCLUDED",
      batch_id: batchId,
      source_edition: manifest.source_edition,
      canonical_bundle_sha256: sha256(bundleBytes),
      canonical_manifest_sha256: sha256(manifestBytes),
      truth_boundary: "CONDITIONS_DIAGRAMS_AND_DECLARED_SOURCE_METADATA_ONLY",
      task_count: 10,
      tasks: library.texts.slice(start, start + 10).map(taskProjection)
    };
    const bytes = jsonBytes(payload);
    const filename = `${batchId}-source-workpack.json`;
    fs.writeFileSync(path.join(outputDir, filename), bytes);
    outputs.push({
      batch_id: batchId,
      filename,
      sha256: sha256(bytes),
      task_count: payload.task_count,
      task_ids: payload.tasks.map((task) => task.task_id)
    });
  }
  const workpackManifest = {
    schema: "linguistpro.materials-pb2.independent-solution-source-workpack-manifest.1",
    status: "PASS_6_BATCHES_X_10_TASKS_SOURCE_ONLY",
    generated_at: "2026-08-30T00:00:00Z",
    canonical_bundle: {
      filename: path.basename(args.bundle),
      sha256: sha256(bundleBytes),
      manifest_sha256: sha256(manifestBytes),
      library_sha256: sha256(libraryBytes)
    },
    batch_count: outputs.length,
    task_count: outputs.reduce((sum, output) => sum + output.task_count, 0),
    outputs
  };
  fs.writeFileSync(path.join(outputDir, "solution-workpack-manifest.json"), jsonBytes(workpackManifest));
  console.log(JSON.stringify({ output_dir: outputDir, batch_count: outputs.length, task_count: 60 }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { taskProjection };
