#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const JSZip = require("../../public/db/jszip.min.js");
const Preview = require("../../public/js/obsidian-lexical-preview.js");
const NotesAutoGen = require("../../public/js/notes-autogen.js");
const PublicCorpusAdapter = require("../../public/js/public-corpus-adapter.js");

function arg(name, fallback) { const i = process.argv.indexOf("--" + name); return i < 0 ? fallback : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); }
function invariant(value, code) { if (!value) { const error = new Error(code); error.code = code; throw error; } }
function safeName(value) { return String(value || "material").normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 120) || "material"; }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchResponse(url, options) {
  for (let attempt = 0; attempt < 7; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) return response;
    if (![429, 502, 503, 504].includes(response.status) || attempt === 6) invariant(false, "HTTP_" + response.status + "_" + url);
    const retrySeconds = Number(response.headers.get("retry-after")) || 0;
    await wait(Math.min(30000, Math.max(1000, retrySeconds * 1000, 1000 * Math.pow(2, attempt))));
  }
}
async function fetchJson(url) { return (await fetchResponse(url, { headers: { Accept: "application/json" } })).json(); }
function resolverSet() {
  const dataPath = path.resolve(__dirname, "../../public/data/inflection/pealim-infl-v12.json.gz");
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(dataPath)).toString("utf8"));
  const paradigms = data.paradigms || [], maps = NotesAutoGen.buildResolverMaps(paradigms);
  const pidMap = new Map(paradigms.filter(row => row && row.pealim_id != null).map(row => [String(row.pealim_id), row]));
  const usage = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/data/usage/function-usage.v1.json"), "utf8")).usage || {};
  const overrides = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/data/inflection/pealim-pos-overrides.v1.json"), "utf8")).overrides || {};
  const usageByPid = new Map();
  for (const key of Object.keys(usage).sort()) { const entry = usage[key] || {}, id = String(entry.pealim_id == null ? "" : entry.pealim_id).trim(); if (id) usageByPid.set(id, usageByPid.has(id) ? null : entry); }
  const strip = value => String(value || "").replace(/[֑-ׇ]/g, "").trim();
  return {
    ambiguityResolver: unit => NotesAutoGen.formFirstResolve(maps, unit), pealimResolver: pid => pidMap.get(String(pid)) || null,
    pealimIdentityResolver: input => {
      if (input.pealim_id && overrides[String(input.pealim_id)]) return Object.assign({ pealim_id: String(input.pealim_id) }, overrides[String(input.pealim_id)]);
      if (input.pealim_id) { const exact = usageByPid.get(String(input.pealim_id)) || null; return exact && exact.lexical_pos === input.context_pos ? Object.assign({}, exact, { context_pos: input.context_pos }) : exact; }
      for (const key of [input.lemma, input.surface].map(strip).filter(Boolean)) if (usage[key] && usage[key].identity_safe === true) return Object.assign({ allow_surface_identity: true }, usage[key]);
      return null;
    },
  };
}
async function zipPlan(plan, bytesByKey, outputPath) {
  const zip = new JSZip();
  plan.files.forEach(file => zip.file(file.path, file.content));
  plan.external_files.forEach(file => { const bytes = bytesByKey.get(file.asset_key); invariant(bytes && bytes.length, "AUDIO_BYTES_MISSING_" + file.asset_key); zip.file(file.path, bytes); });
  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, output);
  const verified = await JSZip.loadAsync(fs.readFileSync(outputPath));
  const files = Object.values(verified.files).filter(entry => !entry.dir);
  invariant(files.length === plan.would_create_files, "ZIP_FILE_COUNT_MISMATCH");
  invariant(files.some(entry => /_LinguistPro\/Тексты\/[^/]+\/Текст\.md$/.test(entry.name)), "ZIP_TEXT_HUB_MISSING");
  return { bytes: output.length, files: files.length };
}

(async () => {
  const baseUrl = String(arg("base-url", "https://linguistpro.kolosei.com")).replace(/\/+$/, "");
  const slug = String(arg("slug", "study-songs"));
  const outputRoot = path.resolve(String(arg("output", "")));
  invariant(arg("output", ""), "OUTPUT_REQUIRED");
  if (fs.existsSync(outputRoot)) invariant(fs.readdirSync(outputRoot).length === 0 || arg("resume", false), "OUTPUT_NOT_EMPTY_USE_RESUME");
  fs.mkdirSync(outputRoot, { recursive: true });
  const rawCatalog = await fetchJson(baseUrl + "/api/public-corpora/" + encodeURIComponent(slug));
  const catalog = PublicCorpusAdapter.normalizeCorpus(rawCatalog);
  const exportTitle = String(arg("title", catalog.title)).trim() || catalog.title;
  const sourceDir = path.join(outputRoot, "_Снимок опубликованной редакции"), sourcePackagePath = path.join(sourceDir, "corpus.zip");
  let sourcePackage;
  if (arg("resume", false) && fs.existsSync(sourcePackagePath)) sourcePackage = fs.readFileSync(sourcePackagePath);
  else {
    const response = await fetchResponse(baseUrl + "/api/public-corpora/" + encodeURIComponent(slug) + "/package", { headers: { Accept: "application/zip" } });
    sourcePackage = Buffer.from(await response.arrayBuffer()); fs.mkdirSync(sourceDir, { recursive: true }); fs.writeFileSync(sourcePackagePath, sourcePackage);
  }
  const sourceZip = await JSZip.loadAsync(sourcePackage), manifestEntry = sourceZip.file("manifest.json"); invariant(manifestEntry, "SOURCE_MANIFEST_MISSING");
  const publicationManifest = JSON.parse(await manifestEntry.async("string"));
  invariant(publicationManifest.slug === catalog.slug && publicationManifest.edition_id === catalog.edition.edition_id && publicationManifest.items.length === catalog.items.length, "SOURCE_EDITION_MISMATCH");
  if (rawCatalog.edition && rawCatalog.edition.package_sha256) invariant(sha256(sourcePackage) === rawCatalog.edition.package_sha256, "SOURCE_PACKAGE_SHA256_MISMATCH");
  const manifestByWork = new Map(publicationManifest.items.map(item => [String(item.public_work_id), item]));
  const titleCounts = new Map();
  for (const card of catalog.items) {
    const title = safeName(card.title);
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }
  const textFolderByWork = new Map(catalog.items.map(card => {
    const title = safeName(card.title);
    const folder = titleCounts.get(title) === 1 ? title : `${title} — ${String(card.position_no).padStart(3, "0")}`;
    return [String(card.public_work_id), folder];
  }));
  const resolvers = resolverSet(), audioBytes = new Map(), plans = [], items = [], failures = [];
  async function loadAudio(key, expected) {
    if (audioBytes.has(key)) return audioBytes.get(key);
    const entry = sourceZip.file("audio/" + key + ".mp3"); invariant(entry, "SOURCE_AUDIO_MISSING_" + key);
    const bytes = await entry.async("nodebuffer"); invariant(bytes.length > 0, "AUDIO_EMPTY");
    invariant(!expected || sha256(bytes) === expected, "AUDIO_SHA256_MISMATCH"); audioBytes.set(key, bytes); return bytes;
  }
  for (const [index, card] of catalog.items.entries()) {
    try {
      const manifestItem = manifestByWork.get(String(card.public_work_id)); invariant(manifestItem, "SOURCE_WORK_MANIFEST_MISSING");
      const workEntry = sourceZip.file("works/" + card.public_work_id + ".json"); invariant(workEntry, "SOURCE_WORK_MISSING");
      const snapshot = JSON.parse(await workEntry.async("string"));
      const raw = { corpus: rawCatalog.corpus, edition: rawCatalog.edition,
        item: Object.assign({}, manifestItem, { snapshot }),
        assets: (manifestItem.assets || []).map(asset => Object.assign({}, asset, { public_stream_allowed: asset.stream, package_download_allowed: asset.download })) };
      const work = PublicCorpusAdapter.normalizeWork(raw), bundle = PublicCorpusAdapter.prepareImportBundle(raw);
      const text = bundle.library.texts[0];
      const report = Preview.analyzeBundle(bundle, Object.assign({ textId: String(text.text_id || text.id) }, resolvers));
      const textFolderName = textFolderByWork.get(String(card.public_work_id));
      const draft = Preview.planObsidianPackage(report, { textFolderName }), meta = new Map(work.assets.map(asset => [asset.asset_key, asset]));
      const audioResults = await Promise.all(draft.audio_plan.assets.map(async asset => {
        try { const bytes = await loadAudio(asset.asset_key, meta.get(asset.asset_key) && meta.get(asset.asset_key).sha256); return { asset_key: asset.asset_key, status: "included", size_bytes: bytes.length }; }
        catch (error) { return { asset_key: asset.asset_key, status: "missing", reason: String(error.code || error.message || "AUDIO_UNAVAILABLE") }; }
      }));
      const plan = Preview.planObsidianPackage(report, { audioResults, textFolderName }); plans.push(plan);
      const filename = String(index + 1).padStart(3, "0") + " — " + safeName(card.title) + ".zip";
      const outputPath = path.join(outputRoot, "Архивы по текстам", filename);
      const zipped = await zipPlan(plan, audioBytes, outputPath);
      const row = { position_no: card.position_no, public_work_id: card.public_work_id, title: card.title, text_id: plan.text_id, text_folder: plan.text_folder,
        archive: path.relative(outputRoot, outputPath), archive_bytes: zipped.bytes, files: zipped.files,
        phrases: report.text.rows_total, lexemes: report.counts.unique_lexemes, unresolved: report.counts.queued_uncertain_occurrences,
        audio_expected: plan.receipt.audio.expected_count, audio_included: plan.receipt.audio.included_count, audio_missing: plan.receipt.audio.missing_count };
      items.push(row); process.stdout.write(`[${index + 1}/${catalog.items.length}] ${card.title} · ${row.lexemes} lexemes · audio ${row.audio_included}/${row.audio_expected}\n`);
    } catch (error) { failures.push({ position_no: card.position_no, public_work_id: card.public_work_id, title: card.title, error: String(error.stack || error) }); process.stderr.write(`[${index + 1}/${catalog.items.length}] FAIL ${card.title}: ${error.message}\n`); }
  }
  invariant(plans.length === catalog.items.length && failures.length === 0, "CORPUS_EXPORT_INCOMPLETE");
  const merged = Preview.mergeObsidianPlans(plans, { title: exportTitle });
  const mergedPath = path.join(outputRoot, safeName(catalog.title) + " — общее хранилище.zip");
  const mergedZip = await zipPlan(merged, audioBytes, mergedPath);
  const manifest = { schema: "linguistpro-public-corpus-obsidian-export-v1", generated_at: new Date().toISOString(), base_url: baseUrl,
    corpus: { slug: catalog.slug, title: exportTitle, source_title: catalog.title, edition_id: catalog.edition.edition_id, edition_number: catalog.edition.edition_number, manifest_sha256: catalog.edition.manifest_sha256 },
    counts: { cards: items.length, individual_archives: items.length, unique_audio_assets: audioBytes.size, combined_files: mergedZip.files,
      combined_bytes: mergedZip.bytes, individual_bytes: items.reduce((sum, item) => sum + item.archive_bytes, 0), failures: failures.length }, items, failures };
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(outputRoot, "README.md"), ["# " + exportTitle + " · LinguistPro → Obsidian", "",
    "Экспорт закреплён за опубликованной редакцией **" + catalog.edition.edition_number + "** (`" + catalog.edition.manifest_sha256 + "`).", "",
    "- `Архивы по текстам` — " + items.length + " автономных ZIP, по одному на карточку.",
    "- `" + path.basename(mergedPath) + "` — единое масштабируемое хранилище: общие словарные карточки и одинаковое аудио записаны один раз.",
    "- `_Снимок опубликованной редакции/corpus.zip` — исходный неизменяемый пакет редакции, из которого построены все архивы.",
    "- `manifest.json` — проверяемый перечень архивов, размеров, лексики, очереди морфологии и аудио.", "",
    "Откройте `_LinguistPro/Корпус.md`, затем выберите текст в папке `_LinguistPro/Тексты/<название карточки>` и его `Учебный маршрут.md`. Технический ID хранится только в свойствах и служебных квитанциях. Личные заметки храните вне `_LinguistPro`.", ""].join("\n"));
  console.log(JSON.stringify(manifest.counts));
})().catch(error => { console.error("[public-corpus-obsidian]", error && error.stack || error); process.exit(1); });
