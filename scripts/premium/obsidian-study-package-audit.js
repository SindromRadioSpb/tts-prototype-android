#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const posix = path.posix;
const JSZip = require("../../public/db/jszip.min.js");

function arg(name) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : "";
}
function fail(message) {
  console.error("[obsidian-study-audit] FAIL:", message);
  process.exit(1);
}
function normalizeZipPath(value) {
  const normalized = posix.normalize(String(value || "").replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.startsWith("../")) throw new Error("unsafe path: " + value);
  return normalized;
}
function visibleBody(markdown) {
  return String(markdown || "")
    .replace(/^---[\s\S]*?\n---\s*/m, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}
function linkTarget(raw) {
  return String(raw || "").split("|", 1)[0].split("#", 1)[0].trim();
}
function candidatesFor(sourcePath, target) {
  const base = normalizeZipPath(posix.join(posix.dirname(sourcePath), target));
  if (posix.extname(base)) return [base];
  return [base + ".md", base + ".base", base];
}
function stripNiqqud(value) { return String(value || "").replace(/[\u0591-\u05C7]/g, ""); }
function regexpEscape(value) { return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

(async () => {
  const zipPath = path.resolve(arg("zip") || "");
  if (!arg("zip")) fail("Usage: --zip <path>");
  if (!fs.existsSync(zipPath)) fail("ZIP not found: " + zipPath);
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const names = entries.map((entry) => normalizeZipPath(entry.name));
  const nameSet = new Set(names);
  if (nameSet.size !== names.length) fail("duplicate normalized paths");
  const textFolders = Array.from(new Set(names.map((name) => {
    const match = name.match(/^_LinguistPro\/Тексты\/([^/]+)\//);
    return match ? match[1] : "";
  }).filter(Boolean)));
  if (textFolders.length !== 1) fail("archive must expose exactly one human-named text folder");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(textFolders[0])) {
    fail("learner-facing text folder is a UUID");
  }

  const receiptEntry = entries.find((entry) => /\/receipt\.json$/.test(entry.name));
  const projectionEntry = entries.find((entry) => /\/projection\.json$/.test(entry.name));
  if (!receiptEntry || !projectionEntry) fail("receipt.json or projection.json missing");
  const receipt = JSON.parse(await receiptEntry.async("string"));
  const projection = JSON.parse(await projectionEntry.async("string"));
  if (receipt.schema !== "linguistpro-obsidian-receipt-v2") fail("unexpected receipt schema");
  if (projection.schema !== "linguistpro-obsidian-lexical-preview-v1") fail("unexpected projection schema");
  if (projection.lexical_presentation_contract !== "surface-headword-root-v1" || receipt.lexical_presentation_contract !== "surface-headword-root-v1") {
    fail("surface/headword/root presentation contract missing");
  }
  if (receipt.would_create_files !== entries.length) fail("receipt file count does not match archive");

  const markdownEntries = entries.filter((entry) => /\.md$/i.test(entry.name));
  const missingLinks = [];
  const exposedIds = [];
  const unsafeMarkup = [];
  let embeddedAudio = 0;
  for (const entry of markdownEntries) {
    const markdown = await entry.async("string");
    const linkScan = markdown.replace(/\x60[^\x60\n]*\x60/g, "");
    const matches = linkScan.matchAll(/!?\[\[([^\]]+)\]\]/g);
    for (const match of matches) {
      const target = linkTarget(match[1]);
      if (!target) continue;
      const candidates = candidatesFor(entry.name, target);
      if (!candidates.some((candidate) => nameSet.has(candidate))) missingLinks.push({ source: entry.name, target });
      if (/\.mp3$/i.test(target)) embeddedAudio++;
    }
    const body = visibleBody(markdown);
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(body)) exposedIds.push(entry.name);
    if (/(^|[^\\])<(?:script|iframe|object|embed|img)\b/i.test(body) || /<[^>]+\son[a-z]+\s*=/i.test(body)) unsafeMarkup.push(entry.name);
  }
  if (missingLinks.length) fail("unresolved internal links: " + JSON.stringify(missingLinks.slice(0, 10)));
  if (exposedIds.length) fail("technical UUID visible in learner body: " + exposedIds.slice(0, 5).join(", "));
  if (unsafeMarkup.length) fail("unsafe imported markup visible in learner body: " + unsafeMarkup.slice(0, 5).join(", "));

  const references = entries.filter((entry) => /_LinguistPro\/Словарь\/.+\.md$/.test(entry.name));
  for (const entry of references) {
    const markdown = await entry.async("string");
    if (/lp_occurrence|Примеры из текста/.test(markdown)) fail("shared reference contains text-specific context: " + entry.name);
    if (!/inflection_source: pealim/.test(markdown)) fail("shared reference lacks Pealim provenance: " + entry.name);
  }
  const textLexemes = entries.filter((entry) => /_LinguistPro\/Тексты\/[^/]+\/Лексемы\/.+\.md$/.test(entry.name));
  if (textLexemes.length !== projection.counts.unique_lexemes) fail("text lexeme conservation mismatch");
  const pathByLexemeId = new Map();
  for (const entry of textLexemes) {
    const markdown = await entry.async("string");
    const idMatch = markdown.match(/^lp_lexeme_id:\s*(.+)$/m);
    if (!idMatch) fail("text lexeme lacks lp_lexeme_id: " + entry.name);
    let id;
    try { id = JSON.parse(idMatch[1]); } catch (_) { id = idMatch[1].trim(); }
    pathByLexemeId.set(String(id), posix.basename(entry.name, ".md"));
    if (!/^headword:|\nheadword:/m.test(markdown) || !/^surface_forms:|\nsurface_forms:/m.test(markdown)) {
      fail("text lexeme lacks explicit headword or surface forms: " + entry.name);
    }
  }
  const phraseBodies = (await Promise.all(entries.filter((entry) => /_LinguistPro\/Тексты\/[^/]+\/Фразы\/.+\.md$/.test(entry.name))
    .map((entry) => entry.async("string")))).join("\n");
  for (const lexeme of projection.lexemes || []) {
    const headword = String(lexeme.headword || "");
    const root = String(lexeme.root || "");
    if (lexeme.study_forms && lexeme.lp_pos !== "verb" && !headword) fail("exact Pealim lexeme lacks a learner headword: " + lexeme.lp_lexeme_id);
    if (lexeme.lp_pos === "verb" && headword && stripNiqqud(headword).charAt(0) !== "ל") {
      fail("verb headword is not an infinitive: " + lexeme.lp_lexeme_id + " => " + headword);
    }
    if (lexeme.lp_pos === "verb" && headword && root && stripNiqqud(headword) === stripNiqqud(root)) {
      fail("verb root masquerades as learner headword: " + lexeme.lp_lexeme_id);
    }
    const target = pathByLexemeId.get(String(lexeme.lp_lexeme_id));
    if (!target) fail("text lexeme path missing for " + lexeme.lp_lexeme_id);
    for (const form of lexeme.surface_forms || []) {
      const expected = new RegExp("\\[\\[\\.\\.\\/Лексемы\\/" + regexpEscape(target) + "\\|" + regexpEscape(form) + "(?: \\([^\\]]+\\))?\\]\\]");
      if (!expected.test(phraseBodies)) fail("contextual form is not the visible phrase-link label: " + lexeme.lp_lexeme_id + " => " + form);
    }
  }
  const occurrencesEntry = entries.find((entry) => /\/occurrences\.tsv$/.test(entry.name));
  if (!occurrencesEntry) fail("occurrences.tsv missing");
  const occurrenceHeader = (await occurrencesEntry.async("string")).split(/\r?\n/, 1)[0];
  for (const column of ["surface", "surface_niqqud", "headword", "headword_unpointed", "headword_source", "root", "meaning_ru"]) {
    if (!occurrenceHeader.split("\t").includes(column)) fail("occurrences.tsv missing column: " + column);
  }

  const audioEntries = entries.filter((entry) => /_LinguistPro\/Аудио\/.+\.mp3$/.test(entry.name));
  if (audioEntries.length !== receipt.audio.included_count) fail("included audio count mismatch");
  if (audioEntries.some((entry) => /[:*?"<>|]/.test(posix.basename(entry.name)))) fail("Windows-unsafe audio filename");
  if (receipt.audio.pending_count !== 0) fail("materialized archive has pending audio");
  if (embeddedAudio < receipt.audio.included_count) fail("included audio is not reachable from phrase notes");

  const verbReference = zip.file("_LinguistPro/Словарь/pid-2321.md");
  if (verbReference) {
    const markdown = await verbReference.async("string");
    for (const field of ["form_infinitive:", "form_present_ms:", "form_present_fs:", "form_present_mp:", "form_present_fp:"]) {
      if (!markdown.includes(field)) fail("verb core field missing: " + field);
    }
  }
  console.log(JSON.stringify({
    status: "PASS",
    zip: zipPath,
    files: entries.length,
    markdown_files: markdownEntries.length,
    lexeme_references: references.length,
    text_lexemes: textLexemes.length,
    audio_files: audioEntries.length,
    audio_embeds: embeddedAudio,
    unresolved_occurrences: receipt.active_resolution_occurrences
  }, null, 2));
})().catch((error) => fail(error && error.stack || error));
