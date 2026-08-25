#!/usr/bin/env node
"use strict";

// Build a complete, resumable Online TTS edition of the canonical Physics
// Year 1 learning bundle. PLAN is the default and makes no provider calls.
// APPLY writes each verified MP3 to a content-keyed cache and atomically saves
// the ledger after every clip. The final ZIP is created only at 100% coverage.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const tb = require("./lib/ttsBake");

const EXPECTED_TITLE = "Физика — задачник, 1 год";
const EXPECTED_TEXTS = 74;
const EXPECTED_ROWS = 425;
const DEFAULT_PROFILE = Object.freeze({
  language: "he-IL",
  voiceName: "he-IL-Standard-A",
  speakingRate: 0.8,
  pitch: 2.5,
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = file => sha256(fs.readFileSync(file));

function parseArgs(argv) {
  const out = { apply: false, verifyOnly: false, concurrency: 2, costCap: 0, ...DEFAULT_PROFILE };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--verify-only") out.verifyOnly = true;
    else if (arg === "--input-bundle") out.inputBundle = argv[++index];
    else if (arg === "--output-bundle") out.outputBundle = argv[++index];
    else if (arg === "--cache-dir") out.cacheDir = argv[++index];
    else if (arg === "--ledger") out.ledger = argv[++index];
    else if (arg === "--report") out.report = argv[++index];
    else if (arg === "--voice") out.voiceName = argv[++index];
    else if (arg === "--rate") out.speakingRate = Number(argv[++index]);
    else if (arg === "--pitch") out.pitch = Number(argv[++index]);
    else if (arg === "--concurrency") out.concurrency = Math.max(1, Math.min(4, Number(argv[++index]) || 2));
    else if (arg === "--confirm-cost-max-clips") out.costCap = Number(argv[++index]);
    else throw new Error("UNKNOWN_ARG:" + arg);
  }
  for (const key of ["inputBundle", "outputBundle", "cacheDir", "ledger", "report"]) {
    if (!out[key]) throw new Error("MISSING_OPTION:" + key);
  }
  if (out.apply && out.verifyOnly) throw new Error("APPLY_AND_VERIFY_ONLY_CONFLICT");
  if (!Number.isFinite(out.speakingRate) || out.speakingRate < 0.5 || out.speakingRate > 2) throw new Error("BAD_RATE");
  if (!Number.isFinite(out.pitch) || out.pitch < -20 || out.pitch > 20) throw new Error("BAD_PITCH");
  out.profile = { language: String(out.language), voiceName: String(out.voiceName), speakingRate: out.speakingRate, pitch: out.pitch };
  return out;
}

function readBundle(bundlePath) {
  const zip = new AdmZip(path.resolve(bundlePath));
  const manifestEntry = zip.getEntry("manifest.json");
  const libraryEntry = zip.getEntry("library/library.json");
  if (!manifestEntry || !libraryEntry) throw new Error("SOURCE_BUNDLE_SCHEMA_INVALID");
  const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  const library = JSON.parse(libraryEntry.getData().toString("utf8"));
  return { zip, manifest, library };
}

function inventoryBundle(bundlePath, profile = DEFAULT_PROFILE) {
  const absolute = path.resolve(bundlePath);
  if (!fs.existsSync(absolute)) throw new Error("SOURCE_BUNDLE_NOT_FOUND");
  const { manifest, library } = readBundle(absolute);
  const texts = Array.isArray(library.texts) ? library.texts : [];
  const rowCount = texts.reduce((sum, text) => sum + (Array.isArray(text.rows) ? text.rows.length : 0), 0);
  if (manifest.corpus_title !== EXPECTED_TITLE || texts.length !== EXPECTED_TEXTS || rowCount !== EXPECTED_ROWS) {
    throw new Error("PHYSICS_SOURCE_INVENTORY_MISMATCH");
  }
  const clips = new Map();
  const rows = [];
  for (const text of texts) {
    const physics = text && text.source_meta && text.source_meta.physics_task;
    if (!physics || !physics.task_number || text.source_label !== EXPECTED_TITLE) throw new Error("PHYSICS_SOURCE_PROVENANCE_MISSING");
    for (const row of text.rows || []) {
      const speech = tb.rowText(row);
      if (!speech) throw new Error("PHYSICS_EMPTY_TTS_ROW:" + text.text_key + ":" + row.order_index);
      const key = tb.keyForText(speech, profile);
      rows.push({ text, row, speech, key });
      if (!clips.has(key)) clips.set(key, { key, text: speech, refs: [] });
      clips.get(key).refs.push({ text_key: text.text_key, row_id: row.row_id, order_index: row.order_index });
    }
  }
  return { absolute, sourceSha256: fileSha256(absolute), manifest, library, texts, rows, clips };
}

function validMp3(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 128) return false;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function atomicJson(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temp = absolute + ".tmp-" + process.pid;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { flag: "w" });
  fs.renameSync(temp, absolute);
}

function loadLedger(file, sourceSha, profile) {
  const fresh = { schema: "linguistpro.physics.tts-ledger.1", source_bundle_sha256: sourceSha, profile, assets: {}, failures: {}, updated_at: null };
  if (!fs.existsSync(file)) return fresh;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (parsed.schema !== fresh.schema || parsed.source_bundle_sha256 !== sourceSha || JSON.stringify(parsed.profile) !== JSON.stringify(profile)) {
    throw new Error("LEDGER_SOURCE_OR_PROFILE_MISMATCH");
  }
  parsed.assets = parsed.assets || {};
  parsed.failures = parsed.failures || {};
  return parsed;
}

function cachedReceipt(cacheDir, ledger, key) {
  const receipt = ledger.assets[key];
  if (!receipt) return null;
  const file = path.resolve(cacheDir, key + ".mp3");
  if (!fs.existsSync(file)) return null;
  const body = fs.readFileSync(file);
  if (!validMp3(body) || body.length !== Number(receipt.bytes) || sha256(body) !== receipt.sha256) return null;
  return { ...receipt, file };
}

async function withRetries(fn, attempts = 4) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await fn(attempt); }
    catch (error) {
      last = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, Math.min(8000, 400 * (2 ** (attempt - 1)))));
    }
  }
  throw last;
}

async function pool(items, concurrency, worker) {
  let cursor = 0;
  async function lane() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, lane));
}

async function bakeMissing(options, inventory, ledger, synthesize = tb.synthesizeMp3) {
  const cacheDir = path.resolve(options.cacheDir);
  fs.mkdirSync(cacheDir, { recursive: true });
  const missing = Array.from(inventory.clips.values()).filter(clip => !cachedReceipt(cacheDir, ledger, clip.key));
  if (!Number.isInteger(options.costCap) || options.costCap < missing.length) throw new Error("COST_CAP_TOO_LOW:" + missing.length);
  const apiKey = String(process.env.GCP_TTS_API_KEY || "").trim();
  if (!apiKey) throw new Error("GCP_TTS_API_KEY_REQUIRED");
  const failures = [];
  await pool(missing, options.concurrency, async clip => {
    try {
      const body = await withRetries(() => synthesize(apiKey, clip.text, options.profile));
      if (!validMp3(body)) throw new Error("INVALID_MP3");
      const finalFile = path.join(cacheDir, clip.key + ".mp3");
      const tempFile = finalFile + ".tmp-" + process.pid;
      fs.writeFileSync(tempFile, body, { flag: "w" });
      fs.renameSync(tempFile, finalFile);
      ledger.assets[clip.key] = { bytes: body.length, sha256: sha256(body), chars: clip.text.length, completed_at: new Date().toISOString() };
      delete ledger.failures[clip.key];
      ledger.updated_at = new Date().toISOString();
      atomicJson(options.ledger, ledger);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      ledger.failures[clip.key] = { message, failed_at: new Date().toISOString(), refs: clip.refs.slice(0, 3) };
      ledger.updated_at = new Date().toISOString();
      atomicJson(options.ledger, ledger);
      failures.push({ key: clip.key, message });
    }
  });
  if (failures.length) throw new Error("TTS_CLIPS_FAILED:" + failures.length + ":" + failures[0].message);
  return { requested: missing.length };
}

function buildOutputBundle(options, inventory, ledger) {
  const { zip, manifest, library } = readBundle(inventory.absolute);
  const receipts = new Map();
  for (const clip of inventory.clips.values()) {
    const receipt = cachedReceipt(options.cacheDir, ledger, clip.key);
    if (!receipt) throw new Error("CACHE_INCOMPLETE:" + clip.key);
    receipts.set(clip.key, receipt);
  }
  for (const text of library.texts) {
    text.tts_profile_json = JSON.stringify(options.profile);
    for (const row of text.rows || []) {
      const speech = tb.rowText(row);
      const key = tb.keyForText(speech, options.profile);
      if (!receipts.has(key)) throw new Error("CACHE_INCOMPLETE:" + key);
      row.audio_asset_key = key;
    }
  }
  library.audio_assets = Array.from(inventory.clips.keys()).sort().map(key => {
    const receipt = receipts.get(key);
    return {
      asset_key: key,
      relative_export_path: "audio/" + key + ".mp3",
      mime_type: "audio/mpeg",
      provider_id: "gcp-tts",
      voice_name: options.profile.voiceName,
      language: options.profile.language,
      duration_ms: null,
      size_bytes: receipt.bytes,
      content_hash: receipt.sha256,
      provenance: { ttsProfile: options.profile, source: "physics-year1-online-tts" },
    };
  });
  manifest.audio_count = library.audio_assets.length;
  manifest.audio_row_count = inventory.rows.length;
  manifest.missing_audio = 0;
  manifest.audio_provider = "gcp-tts:" + options.profile.voiceName;
  manifest.audio_profile = options.profile;
  manifest.source_bundle_sha256 = inventory.sourceSha256;
  zip.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"));
  zip.updateFile("library/library.json", Buffer.from(JSON.stringify(library, null, 2) + "\n", "utf8"));
  for (const [key, receipt] of receipts) zip.addLocalFile(receipt.file, "audio", key + ".mp3");
  const output = path.resolve(options.outputBundle);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = output + ".tmp-" + process.pid;
  zip.writeZip(temp);
  fs.renameSync(temp, output);
  return verifyOutputBundle(output, options.profile, inventory.sourceSha256);
}

function verifyOutputBundle(bundlePath, expectedProfile = DEFAULT_PROFILE, expectedSourceSha = null) {
  const absolute = path.resolve(bundlePath);
  const { zip, manifest, library } = readBundle(absolute);
  const texts = library.texts || [];
  const rows = texts.flatMap(text => text.rows || []);
  if (texts.length !== EXPECTED_TEXTS || rows.length !== EXPECTED_ROWS) throw new Error("OUTPUT_INVENTORY_MISMATCH");
  if (manifest.corpus_title !== EXPECTED_TITLE || manifest.audio_row_count !== EXPECTED_ROWS || manifest.missing_audio !== 0) throw new Error("OUTPUT_MANIFEST_MISMATCH");
  if (expectedSourceSha && manifest.source_bundle_sha256 !== expectedSourceSha) throw new Error("OUTPUT_SOURCE_SHA_MISMATCH");
  if (JSON.stringify(manifest.audio_profile) !== JSON.stringify(expectedProfile)) throw new Error("OUTPUT_PROFILE_MISMATCH");
  const assets = new Map((library.audio_assets || []).map(asset => [asset.asset_key, asset]));
  for (const row of rows) {
    if (!row.audio_asset_key || !assets.has(row.audio_asset_key)) throw new Error("OUTPUT_ROW_AUDIO_MISSING");
  }
  for (const [key, asset] of assets) {
    const entry = zip.getEntry("audio/" + key + ".mp3");
    if (!entry) throw new Error("OUTPUT_AUDIO_ENTRY_MISSING:" + key);
    const body = entry.getData();
    if (!validMp3(body) || body.length !== Number(asset.size_bytes) || sha256(body) !== asset.content_hash) throw new Error("OUTPUT_AUDIO_HASH_MISMATCH:" + key);
  }
  return { bundle: absolute, bundle_sha256: fileSha256(absolute), text_count: texts.length, row_count: rows.length, audio_assets: assets.size, audio_bytes: Array.from(assets.values()).reduce((sum, asset) => sum + Number(asset.size_bytes || 0), 0), profile: expectedProfile };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.verifyOnly) {
    const verified = verifyOutputBundle(options.outputBundle, options.profile);
    atomicJson(options.report, { ok: true, mode: "VERIFY_ONLY", ...verified, verified_at: new Date().toISOString() });
    process.stdout.write(JSON.stringify(verified, null, 2) + "\n");
    return verified;
  }
  const inventory = inventoryBundle(options.inputBundle, options.profile);
  const ledger = loadLedger(path.resolve(options.ledger), inventory.sourceSha256, options.profile);
  const cached = Array.from(inventory.clips.keys()).filter(key => cachedReceipt(options.cacheDir, ledger, key)).length;
  const plan = { ok: true, mode: options.apply ? "APPLY" : "PLAN", source_bundle: inventory.absolute, source_bundle_sha256: inventory.sourceSha256, texts: inventory.texts.length, rows: inventory.rows.length, unique_clips: inventory.clips.size, cached_clips: cached, missing_clips: inventory.clips.size - cached, profile: options.profile, output_bundle: path.resolve(options.outputBundle) };
  if (!options.apply) {
    atomicJson(options.report, plan);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return plan;
  }
  await bakeMissing(options, inventory, ledger);
  const verified = buildOutputBundle(options, inventory, ledger);
  const report = { ...plan, mode: "APPLIED", cached_clips_before: cached, generated_clips: inventory.clips.size - cached, ...verified, completed_at: new Date().toISOString() };
  atomicJson(options.report, report);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) main().catch(error => { process.stderr.write("physics-corpus-tts: " + error.message + "\n"); process.exitCode = 1; });
module.exports = { DEFAULT_PROFILE, parseArgs, inventoryBundle, validMp3, loadLedger, cachedReceipt, bakeMissing, buildOutputBundle, verifyOutputBundle, main };
