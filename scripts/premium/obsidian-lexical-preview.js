#!/usr/bin/env node
"use strict";

// Read-only P0 preview over an existing LinguistPro library ZIP.
// No output file is written unless the caller explicitly redirects stdout.
//
// node scripts/premium/obsidian-lexical-preview.js \
//   --zip C:/path/library-bundle.zip --title "Кфар Аза - 2"

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const JSZip = require("../../public/db/jszip.min.js");
const Preview = require("../../public/js/obsidian-lexical-preview.js");
const NotesAutoGen = require("../../public/js/notes-autogen.js");

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next && !String(next).startsWith("--") ? next : true;
}

function usage(message) {
  if (message) console.error("[obsidian-preview]", message);
  console.error("Usage: node scripts/premium/obsidian-lexical-preview.js --zip <bundle.zip> (--text-id <id> | --title <title>) [--details]");
  process.exit(2);
}

async function readJson(zip, names, required) {
  for (const name of names) {
    const entry = zip.file(name);
    if (entry) return JSON.parse(await entry.async("string"));
  }
  if (required) throw new Error("Missing ZIP entry: " + names.join(" or "));
  return {};
}

function summary(report) {
  return {
    schema: report.schema,
    read_only: report.read_only,
    text: report.text,
    counts: report.counts,
    lexemes_by_pos: report.lexemes_by_pos,
    occurrences_by_pos: report.occurrences_by_pos,
    completeness_counts: report.completeness_counts,
    completeness_pct: report.completeness_pct,
    confidence_bands: report.confidence_bands,
    resolution_channels: report.resolution_channels,
    identity_guard_reasons: report.identity_guard_reasons,
    provider_pos_values: report.provider_pos_values,
    collision_samples: report.collision_samples
  };
}

function packageSummary(plan) {
  return {
    schema: plan.schema,
    read_only: plan.read_only,
    text_id: plan.text_id,
    would_create_files: plan.would_create_files,
    would_write_bytes: plan.would_write_bytes,
    would_write_mib: Math.round(plan.would_write_bytes / 1024 / 1024 * 100) / 100,
    files_by_kind: plan.files_by_kind,
    base_preview: plan.base_preview
  };
}

(async () => {
  const zipArg = arg("zip", "");
  const textId = arg("text-id", "");
  const title = arg("title", "");
  if (!zipArg) usage("--zip is required");
  if (!textId && !title) usage("--text-id or --title is required");

  const zipPath = path.resolve(String(zipArg));
  if (!fs.existsSync(zipPath)) usage("ZIP not found: " + zipPath);

  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const library = await readJson(zip, ["library/library.json", "library.json"], true);
  const notesAdvanced = await readJson(zip, ["library/notes_advanced.json", "notes_advanced.json"], false);
  let ambiguityResolver = null;
  let pealimResolver = null;
  if (!arg("no-resolve-ambiguity", false)) {
    const dataPath = path.resolve(__dirname, "../../public/data/inflection/pealim-infl-v12.json.gz");
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(dataPath)).toString("utf8"));
    const maps = NotesAutoGen.buildResolverMaps(data.paradigms || []);
    const pidMap = new Map((data.paradigms || []).filter((row) => row && row.pealim_id != null).map((row) => [String(row.pealim_id), row]));
    ambiguityResolver = (unit) => NotesAutoGen.formFirstResolve(maps, unit);
    pealimResolver = (pid) => pidMap.get(String(pid)) || null;
  }
  const report = Preview.analyzeBundle(
    { library, notes_advanced: notesAdvanced },
    { textId, title, ambiguityResolver, pealimResolver }
  );
  const out = arg("details", false) ? report : summary(report);
  if (arg("package-plan", false)) out.package_plan = packageSummary(Preview.planObsidianPackage(report));
  console.log(JSON.stringify(out, null, 2));
})().catch((error) => {
  console.error("[obsidian-preview]", error && error.stack || error);
  process.exit(1);
});
