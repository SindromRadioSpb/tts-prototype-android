#!/usr/bin/env node
"use strict";
// scripts/premium/bake-dictate-audio.js — CLG-P7.2c dictate:tg OFFLINE word-prebake.
// Синтезирует АУДИО огласованных слов-диктантов (мой BYOK-ключ, ЛОКАЛЬНО — серверного TTS-ключа НЕТ,
// owner-инвариант) в ФИКСИРОВАННОМ профиле DICTATE_TTS_PROFILE и пушит mp3 на прод-том → keyless-
// раздача /api/audio/:key. Инкрементально (пропускает существующие). НЕ читает due-проекции юзеров.
//
//   GCP_TTS_API_KEY=AIza... node scripts/premium/bake-dictate-audio.js [--limit N] [--dry-run]
//   AUDIO_UPLOAD_TOKEN=... node scripts/premium/bake-dictate-audio.js --push --base https://linguistpro.kolosei.com
//   AUDIO_UPLOAD_TOKEN=... node scripts/premium/bake-dictate-audio.js --push-only --out-dir <dir> --base <url>
//
// ⚠ КЛЮЧ-ИНВАРИАНТ (owner config-string-match-by-construction): assetKey считается через ТУ ЖЕ пару
// pure-функций, что сервер — keyingService.dictateFormForItemKey → computeDictateAssetKey (assetType
// 'word', DICTATE_TTS_PROFILE). НИКОГДА ttsBake.keyForText (assetType:'row' → ДРУГОЙ ключ = тихий 0).
//
// D-5 (owner): вход = ЧАСТОТНЫЙ/курс-нейтральный лексикон — по умолчанию ВСЕ dictate-безопасные леммы
// shipped-датасета (не PII, не проекции). --items <file.json> = явный список item_key[]. Омофон-
// небезопасные / неоднозначные слова отфильтрованы dictateFormForItemKey (→ null → skip, не тихо).
//
// ⚠ OUTWARD-FACING на --push: публикует аудио на живой сервер. Прод-env AUDIO_UPLOAD_TOKEN должен
// совпадать с сервером. Честно: провалы синтеза/пуша считаются и печатаются, никогда не глотаются.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const tb = require("./lib/ttsBake");
const keyingService = require(path.join(ROOT, "db", "keyingService"));
const { computeDictateAssetKey, DICTATE_TTS_PROFILE, getAudioRelativePath } = require(path.join(ROOT, "db", "premium", "ttsAssetKey"));

// ── ЕДИНСТВЕННЫЙ источник ключа (и независимый оракул для гейта): itemKey → {vocalized, written,
// assetKey} через ТЕ ЖЕ функции, что сервер. assetKey совпадает с серверным ПО ПОСТРОЕНИЮ.
// null если слово не dictate-безопасно (омофон / неоднозначно / нет надёжной огласовки).
async function assetKeyForItem(itemKey) {
  const d = await keyingService.dictateFormForItemKey(itemKey);
  if (!d || !d.vocalized) return null;
  return { itemKey: String(itemKey), vocalized: d.vocalized, written: d.written, assetKey: computeDictateAssetKey(d.vocalized) };
}

function parseArgs(argv) {
  const a = { limit: 0, concurrency: 4, dryRun: false, push: false, pushOnly: false,
    base: "https://linguistpro.kolosei.com", items: "", outDir: path.join(ROOT, ".tmp", "dictate-audio") };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--limit") a.limit = Number(argv[++i] || 0);
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(argv[++i] || 4));
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--push") a.push = true;
    else if (k === "--push-only") a.pushOnly = true;
    else if (k === "--base") a.base = String(argv[++i] || a.base).replace(/\/+$/, "");
    else if (k === "--items") a.items = path.resolve(String(argv[++i] || ""));
    else if (k === "--out-dir") a.outDir = path.resolve(String(argv[++i] || a.outDir));
  }
  return a;
}

// частотный/курс-нейтральный набор item_key: явный файл ИЛИ все pid-леммы shipped-датасета (D-5).
async function loadItemKeys(args) {
  if (args.items) {
    const raw = JSON.parse(fs.readFileSync(args.items, "utf8"));
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.item_keys) ? raw.item_keys : []);
    return arr.map(String).filter(Boolean);
  }
  const b = await keyingService.ensureLoaded();
  const seen = new Set(); const keys = [];
  for (const p of (b.ds && b.ds.paradigms) || []) {
    if (p && p.pealim_id != null && !seen.has(String(p.pealim_id))) { seen.add(String(p.pealim_id)); keys.push("pid:" + p.pealim_id); }
  }
  return keys;
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  async function lane() { while (true) { const i = idx++; if (i >= items.length) return; await worker(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}

async function synthWithRetry(apiKey, text, profile, tries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try { return await tb.synthesizeMp3(apiKey, text, profile); }
    catch (e) {
      lastErr = e; const status = e && e.status;
      const transient = status === 429 || (status >= 500 && status < 600) || status == null;
      if (!transient || attempt === tries) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt * attempt));
    }
  }
  throw lastErr;
}

// ── push-фаза: HEAD-проверка + upload на прод-том (контракт push-canon-audio.js) ────────────────
async function pushOne(base, token, key, filePath, tries = 3) {
  const mp3Base64 = fs.readFileSync(filePath).toString("base64");
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(base + "/api/audio/cache/upload", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Audio-Upload-Token": token },
        body: JSON.stringify({ assetKey: key, mp3Base64 }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body && body.ok) return { ok: true, alreadyExisted: !!body.alreadyExisted };
      if (r.status === 403) { const e = new Error("403 BAD_UPLOAD_TOKEN (AUDIO_UPLOAD_TOKEN != server?)"); e.fatal = true; throw e; }
      if (r.status === 503) { const e = new Error("503 UPLOAD_DISABLED (server has no AUDIO_UPLOAD_TOKEN)"); e.fatal = true; throw e; }
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) lastErr = new Error("HTTP " + r.status);
      else throw new Error("HTTP " + r.status + " " + JSON.stringify(body).slice(0, 120));
    } catch (e) { if (e.fatal) throw e; lastErr = e; }
    if (attempt < tries) await new Promise((res) => setTimeout(res, 700 * attempt * attempt));
  }
  throw lastErr || new Error("upload failed");
}

async function pushPhase(args, stagePath, keys) {
  const token = process.env.AUDIO_UPLOAD_TOKEN || "";
  if (!token) { console.error("ERROR: AUDIO_UPLOAD_TOKEN not set (must match server). Aborting push."); process.exit(2); }
  const files = keys.map((k) => ({ key: k, file: stagePath(k) })).filter((x) => fs.existsSync(x.file));
  console.log("\n=== push dictate audio → prod === base=" + args.base + "  files=" + files.length);
  let uploaded = 0, present = 0, already = 0, failed = 0; const failures = [];
  await runPool(files, Math.min(args.concurrency, 4), async (x) => {
    try {
      const head = await fetch(args.base + "/api/audio/" + x.key, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (head) { present++; return; }
      const res = await pushOne(args.base, token, x.key, x.file);
      if (res.alreadyExisted) already++; else uploaded++;
    } catch (e) { failed++; failures.push({ key: x.key, error: (e && e.message) || String(e) }); if (e && e.fatal) console.error("FATAL: " + e.message); }
  });
  console.log("uploaded=" + uploaded + "  alreadyPresent=" + present + "  alreadyExisted=" + already + "  failed=" + failed);
  if (failures.length) { for (const f of failures.slice(0, 10)) console.log("   " + f.key.slice(0, 12) + "…  " + f.error); process.exit(1); }
  console.log("✓ push complete. Prod serves these keyless via /api/audio/:key.");
}

async function main() {
  const args = parseArgs(process.argv);
  const stageDir = path.join(args.outDir, "audio-cache");
  fs.mkdirSync(stageDir, { recursive: true });
  const stagePath = (key) => path.join(stageDir, key + ".mp3");

  if (args.pushOnly) {
    const keys = fs.readdirSync(stageDir).filter((f) => /^[a-f0-9]{64}\.mp3$/.test(f)).map((f) => f.replace(/\.mp3$/, ""));
    if (!keys.length) { console.error("ERROR: no <key>.mp3 in " + stageDir); process.exit(2); }
    return await pushPhase(args, stagePath, keys);
  }

  const apiKey = String(process.env.GCP_TTS_API_KEY || process.env.GCP_TTS_KEY || "").trim();
  if (!args.dryRun) {
    if (!apiKey) { console.error("ERROR: set GCP_TTS_API_KEY in env (or --dry-run)."); process.exit(2); }
    if (!apiKey.startsWith("AIza")) { console.error("ERROR: key must start with 'AIza'."); process.exit(2); }
  }

  console.log("=== CLG-P7.2c dictate audio bake ===");
  console.log("profile voice=" + DICTATE_TTS_PROFILE.voiceName + "  engine=gcp-tts-v1  concurrency=" + args.concurrency + (args.dryRun ? "  [DRY RUN]" : ""));

  const itemKeys = await loadItemKeys(args);
  console.log("candidate item_keys=" + itemKeys.length + (args.items ? "  (--items " + path.basename(args.items) + ")" : "  (dataset lemmas, D-5)"));

  const work = []; const seenKeys = new Set(); let unsafe = 0;
  for (const ik of itemKeys) {
    let r = null; try { r = await assetKeyForItem(ik); } catch (_) { r = null; }
    if (!r) { unsafe++; continue; }                          // не dictate-безопасно → skip (омофон-фильтр)
    if (seenKeys.has(r.assetKey)) continue;                   // dedup идентичных огласовок
    seenKeys.add(r.assetKey); work.push(r);
    if (args.limit && work.length >= args.limit) break;
  }
  console.log("dictate-safe unique=" + work.length + "  skipped(unsafe/unresolved)=" + unsafe);

  let already = 0;
  for (const w of work) if (fs.existsSync(stagePath(w.assetKey))) { w.staged = true; already++; }
  const todo = work.filter((w) => !w.staged);
  const totalChars = todo.reduce((s, w) => s + w.vocalized.length, 0);
  console.log("staged already=" + already + "  to synthesize=" + todo.length + "  chars=" + totalChars + "\n");

  const failures = []; let baked = 0;
  if (!args.dryRun && todo.length) {
    await runPool(todo, args.concurrency, async (w) => {
      try {
        const mp3 = await synthWithRetry(apiKey, w.vocalized, DICTATE_TTS_PROFILE);
        if (!mp3 || !mp3.length) throw new Error("empty audio");
        const tmp = stagePath(w.assetKey) + ".part";
        fs.writeFileSync(tmp, mp3); fs.renameSync(tmp, stagePath(w.assetKey));
        w.staged = true; baked++;
      } catch (e) { failures.push({ itemKey: w.itemKey, assetKey: w.assetKey, error: (e && e.message) || String(e), status: e && e.status }); }
    });
  }

  // леджер (не тихо): что безопасно, что запечено, что провалилось
  const ledger = {
    p72c: "dictate-bake", profile: DICTATE_TTS_PROFILE,
    stats: { candidates: itemKeys.length, safe_unique: work.length, unsafe, staged_before: already, baked, failed: failures.length },
    items: work.map((w) => ({ item_key: w.itemKey, asset_key: w.assetKey, written: w.written })),
  };
  fs.writeFileSync(path.join(args.outDir, "dictate-ledger.json"), JSON.stringify(ledger, null, 2));
  console.log("baked=" + baked + "  skipped(staged)=" + already + "  failed=" + failures.length + "  ledger → " + path.relative(ROOT, path.join(args.outDir, "dictate-ledger.json")));
  if (failures.length) {
    console.log("\n⚠ " + failures.length + " FAILED (re-run resumable):");
    for (const f of failures.slice(0, 10)) console.log("   " + (f.status || "?") + "  " + f.assetKey.slice(0, 12) + "…  " + f.itemKey + "  — " + f.error);
    process.exit(1);
  }

  if (args.push && !args.dryRun) await pushPhase(args, stagePath, work.map((w) => w.assetKey));
  else if (!args.dryRun) console.log("\nTo publish: AUDIO_UPLOAD_TOKEN=… node scripts/premium/bake-dictate-audio.js --push-only --out-dir " + path.relative(ROOT, args.outDir) + " --base <url>");
  console.log("\n✓ dictate bake complete." + (args.dryRun ? " (dry run — no audio written)" : ""));
}

module.exports = { assetKeyForItem, DICTATE_TTS_PROFILE };

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
}
