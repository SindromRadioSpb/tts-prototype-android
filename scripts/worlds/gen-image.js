#!/usr/bin/env node
"use strict";
// LinguistPro Worlds — Gemini image generation with a hard spend cap and full provenance.
//
// Key: GEMINI_IMAGE_API_KEY in .env.agents (gitignored; a separate key with its own spending
// limit, never the app's BYOK keys). Every call is appended to art/worlds/_gen/ledger.jsonl
// (prompt, model, reference files, output sha256, estimated USD) BEFORE the budget check of the
// next call, so the cap holds across runs.
//
// Usage:
//   node scripts/worlds/gen-image.js --id <slug> --prompt-file <txt> [--ref <png> ...] [--aspect 16:9]
//        [--out art/worlds/_gen-scratch] [--dry]
//   node scripts/worlds/gen-image.js --ledger          (spend summary)
// Env: GEMINI_IMAGE_MODEL (default gemini-2.5-flash-image), WORLD_GEN_BUDGET_USD (default 10),
//      WORLD_GEN_USD_PER_IMAGE (default 0.04 — conservative estimate; update from the provider price list).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const LEDGER = path.join(ROOT, "art", "worlds", "_gen", "ledger.jsonl");

function loadEnvAgents() {
  const file = path.join(ROOT, ".env.agents");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function ledgerEntries() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
function spent() { return ledgerEntries().reduce((s, e) => s + (Number(e.usd) || 0), 0); }
function appendLedger(entry) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify(entry) + "\n");
}

function args(argv) {
  const a = { ref: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--ref") a.ref.push(argv[++i]);
    else if (k === "--dry" || k === "--ledger") a[k.slice(2)] = true;
    else if (k.startsWith("--")) a[k.slice(2)] = argv[++i];
  }
  return a;
}

async function main() {
  const a = args(process.argv.slice(2));
  const env = Object.assign({}, loadEnvAgents(), process.env);
  const budget = Number(env.WORLD_GEN_BUDGET_USD || 10);
  const unit = Number(env.WORLD_GEN_USD_PER_IMAGE || 0.04);
  if (a.ledger) {
    const e = ledgerEntries();
    console.log(`calls ${e.length}, ok ${e.filter((x) => x.ok).length}, estimated spend $${spent().toFixed(2)} of $${budget}`);
    return;
  }
  if (!a.id || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(a.id)) throw new Error("--id <slug> required");
  const prompt = a.prompt || (a["prompt-file"] && fs.readFileSync(path.resolve(a["prompt-file"]), "utf8"));
  if (!prompt) throw new Error("--prompt or --prompt-file required");
  const model = env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const outDir = path.resolve(a.out || path.join(ROOT, "art", "worlds", "_gen-scratch"));
  const already = spent();
  if (already + unit > budget + 1e-9) throw new Error(`budget cap: $${already.toFixed(2)} spent, next call $${unit} exceeds $${budget}`);
  const refs = a.ref.map((p) => {
    const abs = path.resolve(p);
    const buf = fs.readFileSync(abs);
    return { path: path.relative(ROOT, abs).replace(/\\/g, "/"), sha256: crypto.createHash("sha256").update(buf).digest("hex"), data: buf.toString("base64"), mime: /\.jpe?g$/i.test(abs) ? "image/jpeg" : "image/png" };
  });
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }, ...refs.map((r) => ({ inline_data: { mime_type: r.mime, data: r.data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: a.aspect ? { aspectRatio: a.aspect } : undefined },
  };
  if (a.dry) { console.log(JSON.stringify({ model, refs: refs.map((r) => r.path), promptChars: prompt.length, spent: already, unit, budget })); return; }
  const key = env.GEMINI_IMAGE_API_KEY;
  if (!key || !/^(AIza|AQ\.)/.test(key)) throw new Error("GEMINI_IMAGE_API_KEY missing or malformed in .env.agents");
  const started = new Date().toISOString();
  let entry = { at: started, id: a.id, model, refs: refs.map(({ path, sha256 }) => ({ path, sha256 })), prompt, usd: unit, ok: false };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { entry.error = `HTTP ${res.status}: ${(json.error && json.error.message || "").slice(0, 300)}`; entry.usd = 0; throw new Error(entry.error); }
    const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    const text = parts.filter((p) => p.text).map((p) => p.text).join(" ").slice(0, 500);
    if (!img) { entry.error = "no image in response" + (text ? ": " + text : ""); throw new Error(entry.error); }
    const data = Buffer.from((img.inlineData || img.inline_data).data, "base64");
    const mime = (img.inlineData || img.inline_data).mimeType || (img.inlineData || img.inline_data).mime_type || "image/png";
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${a.id}.${mime.includes("jpeg") ? "jpg" : "png"}`);
    fs.writeFileSync(file, data);
    entry = Object.assign(entry, { ok: true, output: path.relative(ROOT, file).replace(/\\/g, "/"), sha256: crypto.createHash("sha256").update(data).digest("hex"), bytes: data.length, usage: json.usageMetadata || null, note: text || undefined });
    fs.writeFileSync(file.replace(/\.(png|jpg)$/, ".json"), JSON.stringify(entry, null, 2) + "\n");
    console.log(`ok ${entry.output} ${data.length}B · spend $${(already + entry.usd).toFixed(2)}/$${budget}`);
  } finally {
    appendLedger(entry);
  }
}

main().catch((e) => { console.error("gen-image:", e.message); process.exit(1); });
