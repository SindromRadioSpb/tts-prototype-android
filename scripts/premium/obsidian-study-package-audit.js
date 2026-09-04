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

(async () => {
  const zipPath = path.resolve(arg("zip") || "");
  if (!arg("zip")) fail("Usage: --zip <path>");
  if (!fs.existsSync(zipPath)) fail("ZIP not found: " + zipPath);
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const names = entries.map((entry) => normalizeZipPath(entry.name));
  const nameSet = new Set(names);
  if (nameSet.size !== names.length) fail("duplicate normalized paths");

  const receiptEntry = entries.find((entry) => /\/receipt\.json$/.test(entry.name));
  const projectionEntry = entries.find((entry) => /\/projection\.json$/.test(entry.name));
  if (!receiptEntry || !projectionEntry) fail("receipt.json or projection.json missing");
  const receipt = JSON.parse(await receiptEntry.async("string"));
  const projection = JSON.parse(await projectionEntry.async("string"));
  if (receipt.schema !== "linguistpro-obsidian-receipt-v2") fail("unexpected receipt schema");
  if (projection.schema !== "linguistpro-obsidian-lexical-preview-v1") fail("unexpected projection schema");
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

  const references = entries.filter((entry) => /_LinguistPro\/reference\/lexemes\/.+\.md$/.test(entry.name));
  for (const entry of references) {
    const markdown = await entry.async("string");
    if (/lp_occurrence|Примеры из текста/.test(markdown)) fail("shared reference contains text-specific context: " + entry.name);
    if (!/inflection_source: pealim/.test(markdown)) fail("shared reference lacks Pealim provenance: " + entry.name);
  }
  const textLexemes = entries.filter((entry) => /_LinguistPro\/texts\/[^/]+\/Лексемы\/.+\.md$/.test(entry.name));
  if (textLexemes.length !== projection.counts.unique_lexemes) fail("text lexeme conservation mismatch");

  const audioEntries = entries.filter((entry) => /_LinguistPro\/media\/audio\/.+\.mp3$/.test(entry.name));
  if (audioEntries.length !== receipt.audio.included_count) fail("included audio count mismatch");
  if (audioEntries.some((entry) => /[:*?"<>|]/.test(posix.basename(entry.name)))) fail("Windows-unsafe audio filename");
  if (receipt.audio.pending_count !== 0) fail("materialized archive has pending audio");
  if (embeddedAudio < receipt.audio.included_count) fail("included audio is not reachable from phrase notes");

  const verbReference = zip.file("_LinguistPro/reference/lexemes/pid-2321.md");
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
