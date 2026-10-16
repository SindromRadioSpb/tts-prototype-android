#!/usr/bin/env node
"use strict";
// Д8-К4 v2 — замер ДО кода, без единого запроса к Dicta (решение владельца 2026-10-17).
// План: docs/planning/word-layer/F4_D8K4_V2_CORPUS_PLACE_PARSE_PLAN_2026_10_17.md.
//
// Что меряет:
//   1. Объём: работы Бен-Иегуды каталога v8 (ready) и элементы общедоступных корпусов Медиатеки (/api/public-corpora) —
//      строк (предложений), слов, непустых строк с ивритом, уникальных строк.
//   2. Переиспользование: сколько строк уже разобрано Dicta в локальном кэше прежней выпечки
//      (.tmp/benyehuda/proclitic-overlay-dicta-cache.json, ключ = строка hebrew_plain.trim()) и в каком поколении
//      (полный токен: огласовка nq есть / старый токен без nq).
//   3. Размер раздачи: файл на работу «хеш строки + токены» (gzip) — по факту на закэшированных работах.
//   4. Польза (Бен-Иегуда, закэшированная часть): правило Д10 (ReaderMorph.resolveCore с местом) на чистом профиле
//      (без лексикона устройства) — сколько мест многозначны, сколько правило А решает, сколько меняет ключ.
// Источники: только публичные файлы прода (GET /data/benyehuda/…, GET /api/public-corpora/…) по одному запросу за раз
// и локальные файлы. Скачанное — в .tmp/d8k4/ (игнорируется git). Итог — measure-results.json рядом со скриптом.
//
// Запуск из корня рабочей копии:  node docs/research/d8k4-corpus-parse/2026-10-17/measure.js [--no-effect]
// Кэш Dicta берётся из основной папки репозитория (переменная D8K4_DICTA_CACHE переопределяет путь).

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const PROD = process.env.D8K4_PROD || "https://linguistpro.kolosei.com";
const TMP = path.join(REPO, ".tmp", "d8k4");
const CACHE = process.env.D8K4_DICTA_CACHE || path.resolve(REPO, "..", "..", ".tmp", "benyehuda", "proclitic-overlay-dicta-cache.json");
const OUT = path.join(__dirname, "measure-results.json");
const NO_EFFECT = process.argv.includes("--no-effect");

const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
globalThis.ReaderMorph = RM;   // text-key-scan.unitAt reads it like the page does
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const HEB = /[א-ת]/;
const WORD = /[א-ת][א-ת֑-ׇ׳״'’-]*/gu;

async function getCached(url, file) {
  const p = path.join(TMP, file);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) { const t = await res.text(); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); return t; }
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

function rowStats(rows, acc, cache) {
  for (const r of rows) {
    const plain = String(r.hebrew_plain != null ? r.hebrew_plain : RM.stripNiqqud(r.hebrew_niqqud || "")).trim();
    acc.rows++;
    if (!plain || !HEB.test(plain)) continue;
    acc.heRows++;
    acc.words += (plain.match(WORD) || []).length;
    acc.uniq.add(plain);
    if (r.hebrew_niqqud && /[ְ-ּ]/.test(r.hebrew_niqqud)) acc.vocalRows++;
    const c = cache ? cache[plain] : null;
    if (c) { acc.cached++; if (c.every((t) => t.nq !== undefined)) acc.cachedRich++; }
  }
}
const newAcc = () => ({ works: 0, rows: 0, heRows: 0, words: 0, vocalRows: 0, cached: 0, cachedRich: 0, uniq: new Set(), worksFull: 0, worksPartial: 0, worksNone: 0, missingFiles: 0 });
function finish(a) {
  const u = a.uniq.size; delete a.uniq;
  return Object.assign(a, { uniqueRows: u, cachedPct: a.heRows ? +(100 * a.cached / a.heRows).toFixed(1) : 0 });
}

// the per-work distribution file as v2 would ship it: [ [rowSha16, [[word, lem, lems, pos, nq, bin, pre], …]], … ]
function packWork(rows, cache) {
  const out = [];
  for (const r of rows) {
    const plain = String(r.hebrew_plain || "").trim();
    const c = plain && cache[plain];
    if (!c) continue;
    out.push([sha(plain).slice(0, 16), c.map((t) => [t.word, t.lem || "", (t.lems || []).filter((x) => x !== t.lem), t.pos || "", t.nq || "", t.bin || "", t.pre || ""])]);
  }
  return out;
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  console.log("[d8k4] Dicta cache:", CACHE);
  const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  const cacheKeys = Object.keys(cache).length;

  // ── 1. Ben-Yehuda v8 ───────────────────────────────────────────────────────
  const root = JSON.parse(await getCached(PROD + "/data/benyehuda/corpus-catalog-v8.json", "corpus-catalog-v8.json"));
  const index = JSON.parse(await getCached(PROD + "/data/benyehuda/" + root.index_file, root.index_file));
  const by = newAcc(), byEra = {}, byWorks = [];
  const ready = index.ready || [];
  for (let i = 0; i < ready.length; i++) {
    const w = ready[i];
    if (i % 100 === 0) process.stdout.write("  BY " + i + "/" + ready.length + "\r");
    const txt = await getCached(PROD + "/data/benyehuda/" + w.file, "by/" + w.file.replace(/^works\//, ""));
    if (!txt) { by.missingFiles++; continue; }
    const rows = ((JSON.parse(txt).library || {}).texts || [])[0]?.rows || [];
    const a = newAcc(); rowStats(rows, a, cache); rowStats(rows, by, null);
    by.works++; by.cached += a.cached; by.cachedRich += a.cachedRich;
    if (a.heRows && a.cached === a.heRows) by.worksFull++; else if (a.cached) by.worksPartial++; else by.worksNone++;
    const e = byEra[w.era || "unknown"] || (byEra[w.era || "unknown"] = { works: 0, heRows: 0, cached: 0 });
    e.works++; e.heRows += a.heRows; e.cached += a.cached;
    byWorks.push({ id: w.id, era: w.era, file: w.file, heRows: a.heRows, cached: a.cached, learning: !!w.learning_edition_id, rows });
  }
  console.log("");

  // ── 2. Mediatheque public corpora ──────────────────────────────────────────
  const corpora = JSON.parse(await getCached(PROD + "/api/public-corpora", "public-corpora.json")).corpora || [];
  const pc = newAcc(), pcCorpora = [], rights = {};
  for (const c of corpora) {
    const cat = JSON.parse(await getCached(PROD + "/api/public-corpora/" + encodeURIComponent(c.slug), "pc/" + c.slug + ".json"));
    const one = { slug: c.slug, title: c.title, items: 0, heRows: 0, words: 0, cached: 0 };
    for (const it of cat.items || []) {
      const rb = it.rights_basis || "unknown"; rights[rb] = (rights[rb] || 0) + 1;
      const url = PROD + "/api/public-corpora/" + encodeURIComponent(c.slug) + "/works/" + encodeURIComponent(it.public_work_id) +
        (it.snapshot_sha256 ? "?snapshot=" + it.snapshot_sha256 : "");
      const txt = await getCached(url, "pc/" + c.slug + "/" + it.public_work_id + "-" + String(it.snapshot_sha256 || "").slice(0, 12) + ".json");
      if (!txt) { pc.missingFiles++; continue; }
      const snap = (JSON.parse(txt).item || {}).snapshot || {};
      const rows = (((snap.library || {}).texts || [])[0] || {}).rows || [];
      // a snapshot may already carry the publisher's stored Dicta parse (notes_advanced.sentence_morph, by row_id) —
      // importBundle restores it, so Д10 already reads those rows after download
      const shipped = new Set(((snap.notes_advanced || {}).sentence_morph || []).filter((m) => m && Array.isArray(m.tokens) && m.tokens.length).map((m) => String(m.sentence_id)));
      const a = newAcc(); rowStats(rows, a, cache); rowStats(rows, pc, null);
      let shippedHe = 0, either = 0;
      for (const r of rows) {
        const plain = String(r.hebrew_plain || "").trim();
        if (!plain || !HEB.test(plain)) continue;
        const sh = shipped.has(String(r.row_id)); if (sh) shippedHe++;
        if (sh || cache[plain]) either++;
      }
      pc.works++; pc.cached += a.cached; pc.cachedRich += a.cachedRich;
      pc.shipped = (pc.shipped || 0) + shippedHe; pc.coveredEither = (pc.coveredEither || 0) + either;
      one.items++; one.heRows += a.heRows; one.words += a.words; one.cached += a.cached; one.shipped = (one.shipped || 0) + shippedHe;
      if (!rows.length) one.noRows = (one.noRows || 0) + 1;
    }
    pcCorpora.push(one);
  }

  // ── 3. size of the per-work file (cached BY works) ─────────────────────────
  let rawBytes = 0, gzBytes = 0, packedRows = 0, maxGz = 0, maxGzId = null;
  for (const w of byWorks) {
    if (!w.cached) continue;
    const buf = Buffer.from(JSON.stringify(packWork(w.rows, cache)), "utf8");
    const gz = zlib.gzipSync(buf, { level: 9 }).length;
    rawBytes += buf.length; gzBytes += gz; packedRows += w.cached;
    if (gz > maxGz) { maxGz = gz; maxGzId = w.id; }
  }

  // ── 4. effect of the Д10 rule on a fresh profile (cached BY rows) ──────────
  let effect = null;
  if (!NO_EFFECT) effect = await measureEffect(byWorks, cache);

  const result = {
    measured_at: new Date().toISOString(), prod: PROD, dicta_requests: 0,
    dicta_cache: { file: path.basename(CACHE), sentences: cacheKeys },
    benyehuda: Object.assign(finish(by), { era: byEra, learningEditions: byWorks.filter((w) => w.learning).length }),
    mediatheque: Object.assign(finish(pc), { corpora: pcCorpora, rights_basis: rights }),
    to_fetch_rows: { benyehuda: by.heRows - by.cached, mediatheque: pc.heRows - pc.cached },
    distribution_file: { works: byWorks.filter((w) => w.cached).length, rows: packedRows, raw_bytes: rawBytes, gzip_bytes: gzBytes,
      gzip_bytes_per_row: packedRows ? +(gzBytes / packedRows).toFixed(1) : 0, max_gzip_bytes: maxGz, max_work: maxGzId },
    effect_d10_fresh_profile: effect,
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}

// The Д10 rule exactly as the app runs it: ReaderMorph.resolveCore(eng, surface, niqqud, { place }) with a place loader
// that serves the cached Dicta tokens (mapped to the stored-row shape) aligned by ReaderMorph.placeUnits.
async function measureEffect(byWorks, cache) {
  const NA = require(path.join(REPO, "public", "js", "notes-autogen.js"));
  const TKS = require(path.join(REPO, "public", "js", "text-key-scan.js"));
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz"))).toString("utf8"));
  const maps = NA.buildResolverMaps(ds.paradigms);
  const pidMap = new Map();
  for (const p of ds.paradigms) if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
  const lookup = (k, b) => { const ix = ds.index[String(k) + " " + String(b || "")]; return ix != null && ds.paradigms[ix] ? ds.paradigms[ix] : null; };
  const eng = { NA, maps, pidMap, lookup, rootIndex: new Map(), procLex: null };
  const toRow = (t) => ({ word: t.word, prefix: t.pre || "", stem: t.stem || "", lemma: t.lem || "", lemmas: t.lems || [], niqqud: t.nq || "", posDicta: t.pos || "", binyan: t.bin || null, confident: !!t.conf });
  const byId = new Map();
  RM.setPlaceLoader(async (sids) => {
    const out = new Map();
    for (const sid of sids) {
      const r = byId.get(sid); if (!r) continue;
      const c = cache[String(r.hebrew_plain || "").trim()];
      const pu = RM.placeUnits({ he_plain: r.hebrew_plain, he_niqqud: r.hebrew_niqqud }, c ? c.map(toRow) : null);
      out.set(sid, { sk: pu.sk, at: pu.at, dec: new Map() });
    }
    return out;
  });
  const e = { works: 0, rows: 0, words: 0, multi: 0, ruleA: 0, changed: 0, byEraChanged: {}, byEraRuleA: {}, samples: [], pairs: {} };
  const LIM = Number(process.env.D8K4_EFFECT_WORKS) || Infinity, t0 = Date.now();
  for (const w of byWorks) {
    if (!w.cached) continue;
    if (e.works++ >= LIM) break;
    if (e.works % 50 === 0) console.log("  effect " + e.works + " works, " + Math.round((Date.now() - t0) / 1000) + " s");
    for (const r of w.rows) {
      const plain = String(r.hebrew_plain || "").trim();
      if (!plain || !cache[plain]) continue;
      const sid = w.id + ":" + r.row_id; byId.set(sid, r);
      await RM.ensurePlaces([sid]);
      const row = { he_plain: r.hebrew_plain, he_niqqud: r.hebrew_niqqud };
      const pu = RM.placeUnits(row, null);
      e.rows++;
      for (let off = 0; off < pu.sk.length; off++) {
        if (!pu.sk[off]) continue;
        const un = TKS.unitAt(row, off); if (!un) continue;
        e.words++;
        const a = await RM.resolveCore(eng, un.surface, un.niqqud);
        if (!a || a.label === "exact" || a.label === "function" || a.functionWord) continue;
        const alts = (a.alts || []).length;
        if (a.label === "likely" && alts >= 1) e.multi++;
        const b = await RM.resolveCore(eng, un.surface, un.niqqud, { place: { sid, off } });
        if (b && b.placeDecided === "dicta") {
          e.ruleA++; e.byEraRuleA[w.era || "unknown"] = (e.byEraRuleA[w.era || "unknown"] || 0) + 1;
          if (String(b.pealim_id) !== String(a.pealim_id)) {
            e.changed++;
            const pk = (w.era === "haskalah" || w.era === "tehiya" ? "A " : "B ") + (un.niqqud || un.surface) + " : " + a.lemma + " → " + b.lemma;
            e.pairs[pk] = (e.pairs[pk] || 0) + 1; e.byEraChanged[w.era || "unknown"] = (e.byEraChanged[w.era || "unknown"] || 0) + 1;
            if (e.samples.length < 40 && e.changed % 25 === 1) e.samples.push({ work: w.id, era: w.era, word: un.niqqud || un.surface, from: a.lemma, to: b.lemma });
          }
        }
      }
      RM.invalidatePlaces([sid]); byId.delete(sid);
    }
  }
  e.seconds = Math.round((Date.now() - t0) / 1000);
  e.distinctPairs = Object.keys(e.pairs).length;
  e.topPairs = Object.entries(e.pairs).sort((x, y) => y[1] - x[1]).slice(0, 60);
  delete e.pairs;
  return e;
}

main().catch((e) => { console.error(e); process.exit(1); });
