#!/usr/bin/env node
"use strict";
// ───────────────────────────────────────────────────────────────────────────
// ingest-live-smoke.js — OWNER-RUN live smoke for Studio Ingest W1
// (STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25, Task 12).
//
// This is a REAL network + REAL LLM smoke test: it hits a running server's
// /api/ingest/fetch-url, /api/ingest/extract-file, and /api/translate-table
// endpoints with a real Gemini key (BYOK — there is NO server-side Gemini key,
// see reference_key_architecture). It is run by the owner on demand, NEVER
// wired into `npm test` or CI (no fixed network dependency, costs real quota).
//
// Usage:
//   node scripts/premium/ingest-live-smoke.js --base http://localhost:3000 \
//     --key <GEMINI_KEY> \
//     [--url <article-url>] [--image <path>] [--pdf <path>] [--any-he "русский текст"]
//
// Key resolution: --key, else env INGEST_SMOKE_GEMINI_KEY. NEVER hardcode a
// key in this file or pass one on a shared/committed line.
// ───────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

// ── CLI parsing (space-separated "--name value", matches run-corpus-prebake.js) ──
function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--")
    ? process.argv[i + 1]
    : def;
}

const BASE = String(arg("base", "http://localhost:3000")).replace(/\/+$/, "");
const KEY_RAW = arg("key", process.env.INGEST_SMOKE_GEMINI_KEY || "");
const URL_INPUT = arg("url", "");
const IMAGE_PATH = arg("image", "");
const PDF_PATH = arg("pdf", "");
const ANY_HE_TEXT = arg("any-he", "");

const GEMINI_KEY_RE = /^(AIza|AQ\.)/;

function printUsage() {
  console.log(`Usage:
  node scripts/premium/ingest-live-smoke.js --base <server-url> --key <GEMINI_KEY> \\
    [--url <article-url>] [--image <path>] [--pdf <path>] [--any-he "текст"]

At least one of --url / --image / --pdf / --any-he is required.
Key: --key <GEMINI_KEY> or env INGEST_SMOKE_GEMINI_KEY (format /^(AIza|AQ\\.)/, never commit it).
This is a LIVE smoke test (real network + real Gemini quota) — run by the owner on demand, not in CI.`);
}

function mimeTypeForImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return null;
}

function truncate(text, n) {
  const s = String(text == null ? "" : text);
  return s.length > n ? s.slice(0, n) + `… [${s.length} chars total]` : s;
}

async function postJson(urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  return { status: res.status, data, rawText: text };
}

function section(title) {
  console.log("");
  console.log("=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

async function runFetchUrl() {
  section(`fetch-url: ${URL_INPUT}`);
  try {
    const { status, data, rawText } = await postJson("/api/ingest/fetch-url", { url: URL_INPUT });
    const ok = status === 200 && data && data.ok === true;
    console.log(`HTTP ${status} | ok=${ok}`);
    if (!ok) {
      console.log(`FAIL: ${data ? JSON.stringify(data) : truncate(rawText, 400)}`);
      return false;
    }
    console.log(`method: ${data.method}`);
    console.log(`title: ${data.title || "(none)"}`);
    console.log(`byline: ${data.byline || "(none)"}`);
    console.log(`finalUrl: ${data.finalUrl}`);
    console.log(`warnings: ${JSON.stringify(data.warnings || [])}`);
    console.log(`text (first 400 chars):\n${truncate(data.text, 400)}`);
    return true;
  } catch (e) {
    console.log(`FAIL (network/exception): ${e.message}`);
    return false;
  }
}

async function runExtractFile(kind, filePath) {
  section(`extract-file ${kind}: ${filePath}`);
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`FAIL: file not found: ${filePath}`);
      return false;
    }
    let mimeType;
    if (kind === "image") {
      mimeType = mimeTypeForImage(filePath);
      if (!mimeType) {
        console.log(`FAIL: unsupported image extension (need .jpg/.jpeg/.png/.webp): ${filePath}`);
        return false;
      }
    } else if (kind === "pdf") {
      mimeType = "application/pdf";
    } else {
      console.log(`FAIL: unknown kind ${kind}`);
      return false;
    }
    const bytes = fs.readFileSync(filePath);
    const dataBase64 = bytes.toString("base64");
    const { status, data, rawText } = await postJson("/api/ingest/extract-file", {
      kind,
      mimeType,
      dataBase64,
      filename: path.basename(filePath),
      geminiApiKey: KEY_RAW,
    });
    const ok = status === 200 && data && data.ok === true;
    console.log(`HTTP ${status} | ok=${ok}`);
    if (!ok) {
      console.log(`FAIL: ${data ? JSON.stringify(data) : truncate(rawText, 400)}`);
      return false;
    }
    console.log(`method: ${data.method}`);
    console.log(`model: ${data.model || "(none)"}`);
    console.log(`language: ${data.language || "(none)"}`);
    console.log(`fromCache: ${data.fromCache}`);
    console.log(`warnings: ${JSON.stringify(data.warnings || [])}`);
    console.log(`text (first 400 chars):\n${truncate(data.text, 400)}`);
    return true;
  } catch (e) {
    console.log(`FAIL (network/exception): ${e.message}`);
    return false;
  }
}

async function runAnyHe() {
  section(`translate-table any-he: "${truncate(ANY_HE_TEXT, 80)}"`);
  try {
    const { status, data, rawText } = await postJson("/api/translate-table", {
      text: ANY_HE_TEXT,
      direction: "any-he",
      geminiApiKey: KEY_RAW,
    });
    const ok = status === 200 && data && Array.isArray(data.rows);
    console.log(`HTTP ${status} | ok=${ok}`);
    if (!ok) {
      console.log(`FAIL: ${data ? JSON.stringify(data) : truncate(rawText, 400)}`);
      return false;
    }
    console.log(`fromCache: ${data.fromCache}`);
    console.log(`rows: ${data.rows.length}`);
    for (const row of data.rows.slice(0, 3)) {
      console.log(
        `  #${row.segmentId}: he="${row.he}" | he_niqqud="${row.he_niqqud}" | translit="${row.translit}" | ru="${row.ru}"`
      );
    }
    return true;
  } catch (e) {
    console.log(`FAIL (network/exception): ${e.message}`);
    return false;
  }
}

async function main() {
  const hasAnyInput = !!(URL_INPUT || IMAGE_PATH || PDF_PATH || ANY_HE_TEXT);
  if (!hasAnyInput) {
    printUsage();
    process.exit(2);
  }

  const key = String(KEY_RAW || "").trim();
  if (!key || !GEMINI_KEY_RE.test(key)) {
    console.error(
      "ERROR: missing or malformed Gemini API key. Pass --key <GEMINI_KEY> or set env " +
        "INGEST_SMOKE_GEMINI_KEY. Expected format /^(AIza|AQ\\.)/  (BYOK — there is no server-side key)."
    );
    process.exit(1);
  }

  console.log(`ingest-live-smoke: base=${BASE}`);

  const results = [];
  if (URL_INPUT) results.push(await runFetchUrl());
  if (IMAGE_PATH) results.push(await runExtractFile("image", IMAGE_PATH));
  if (PDF_PATH) results.push(await runExtractFile("pdf", PDF_PATH));
  if (ANY_HE_TEXT) results.push(await runAnyHe());

  const allOk = results.every(Boolean);
  section(`SUMMARY: ${results.filter(Boolean).length}/${results.length} ok`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("ingest-live-smoke FAILED (unexpected):", e && e.stack ? e.stack : e);
  process.exit(1);
});
