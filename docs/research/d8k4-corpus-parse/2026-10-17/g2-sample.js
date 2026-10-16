#!/usr/bin/env node
"use strict";
// Д8-К4 v2 · Г2 — слепая выборка для экзаменатора (протокол Д10; порог записан в плане ДО прогона).
// План: docs/planning/word-layer/F4_D8K4_V2_CORPUS_PLACE_PARSE_PLAN_2026_10_17.md, раздел «Гейт Г2».
//
// Совокупность: места корпуса, где правило Д10 (ReaderMorph.resolveCore с местом, чистый профиль) МЕНЯЕТ ключ.
// Факты Dicta: Бен-Иегуда — кэш прежней выпечки (без запросов к Dicta); Медиатека — разбор, который уже едет
// в снимках изданий (notes_advanced.sentence_morph, «Учебные песни»).
// Страты: a — Бен-Иегуда Хаскала+Тхия; b — Бен-Иегуда прочие эпохи; c — Медиатека; g — «своя статья»
// (прежний ключ — статья, чья цитатная форма = огласованная форма текста; Р2/Д10.1); k — контроль (правило
// подтверждает ключ; второй вариант — альтернатива формы). Квоты a 100, b 100, c 100, g 60, k 30; равновероятно по
// вхождениям (резервуар, mulberry32, зерно 20261017). Одно место попадает в одну страту (g раньше a/b).
//
// Выход: .tmp/d8k4/g2/sheet-*.json (то, что видит экзаменатор: предложение, слово, два варианта в случайном порядке)
// и .tmp/d8k4/g2/key.json (какой вариант — правило). Ключ до оценки в git не кладётся.
// Запуск из корня рабочей копии после measure.js (скачанные работы в .tmp/d8k4/).

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const TMP = path.join(REPO, ".tmp", "d8k4");
const OUT = path.join(TMP, "g2");
const CACHE = process.env.D8K4_DICTA_CACHE || path.resolve(REPO, "..", "..", ".tmp", "benyehuda", "proclitic-overlay-dicta-cache.json");
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
globalThis.ReaderMorph = RM;
const NA = require(path.join(REPO, "public", "js", "notes-autogen.js"));
const TKS = require(path.join(REPO, "public", "js", "text-key-scan.js"));

const QUOTA = { a: 100, b: 100, c: 100, g: 60, k: 30 };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261017);
const res = {}, seen = {};
function offer(stratum, item) {
  const r = res[stratum] || (res[stratum] = []); seen[stratum] = (seen[stratum] || 0) + 1;
  if (r.length < QUOTA[stratum]) r.push(item);
  else { const j = Math.floor(rnd() * seen[stratum]); if (j < QUOTA[stratum]) r[j] = item; }
}

const POS_RU = { noun: "существительное", verb: "глагол", adjective: "прилагательное", adverb: "наречие", numeral: "числительное", propernoun: "имя собственное", preposition: "предлог", pronoun: "местоимение", conjunction: "союз" };
const loose = (s) => RM.stripNiqqud(String(s || "")).replace(/[^א-ת]/g, "");
const vowelsOnly = (s) => String(s || "").normalize("NFC").replace(/[֑-ֽ֯]/g, "").replace(/[^א-תְ-ׇ]/g, "");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz"))).toString("utf8"));
  const maps = NA.buildResolverMaps(ds.paradigms);
  const pidMap = new Map();
  for (const p of ds.paradigms) if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
  const lookup = (k, b) => { const ix = ds.index[String(k) + " " + String(b || "")]; return ix != null && ds.paradigms[ix] ? ds.paradigms[ix] : null; };
  const eng = { NA, maps, pidMap, lookup, rootIndex: new Map(), procLex: null };
  const reading = (pid) => { const p = pidMap.get(String(pid)); return p ? { pid: String(pid), lemma: p.lemma_niqqud || p.lemma, pos: POS_RU[p.pos] || p.pos, meaning: p.meaning || "" } : null; };
  // «своя статья» (Д9 A1): цитатная форма статьи (лемма; ед. ч. / м. р. ед. ч.) = огласованная форма текста
  const ownEntry = (pid, niqqud) => {
    const p = pidMap.get(String(pid)); if (!p || !niqqud) return false;
    const v = vowelsOnly(niqqud);
    return [p.lemma_niqqud, p.cells && p.cells.s && p.cells.s.he, p.cells && p.cells["ms-a"] && p.cells["ms-a"].he].filter(Boolean).some((c) => vowelsOnly(c) === v);
  };

  const store = new Map();
  RM.setPlaceLoader(async (sids) => {
    const out = new Map();
    for (const sid of sids) { const x = store.get(sid); if (x) out.set(sid, { sk: RM.placeUnits(x.row, x.toks).sk, at: RM.placeUnits(x.row, x.toks).at, dec: new Map() }); }
    return out;
  });
  const fromCache = (t) => ({ word: t.word, prefix: t.pre || "", stem: t.stem || "", lemma: t.lem || "", lemmas: t.lems || [], niqqud: t.nq || "", posDicta: t.pos || "", binyan: t.bin || null });

  async function scanRow(sid, row, toks, meta) {
    store.set(sid, { row, toks });
    await RM.ensurePlaces([sid]);
    const pu = RM.placeUnits(row, toks);
    for (let off = 0; off < pu.sk.length; off++) {
      if (!pu.sk[off]) continue;
      const un = TKS.unitAt(row, off); if (!un) continue;
      const a = await RM.resolveCore(eng, un.surface, un.niqqud);
      if (!a || a.label === "exact" || a.label === "function" || a.functionWord || !a.pealim_id) continue;
      const b = await RM.resolveCore(eng, un.surface, un.niqqud, { place: { sid, off } });
      if (!b || b.placeDecided !== "dicta") continue;
      const dt = pu.at.get(off) || {};
      const base = { sid, off, word: un.niqqud || un.surface, sentence: row.he_niqqud || row.he_plain, work: meta.work, era: meta.era, corpus: meta.corpus,
        dicta: { lemma: dt.lemma, pos: dt.posDicta, prefix: dt.prefix || "" } };
      if (String(b.pealim_id) !== String(a.pealim_id)) {
        const item = Object.assign(base, { before: reading(a.pealim_id), rule: reading(b.pealim_id), own: ownEntry(a.pealim_id, un.niqqud) });
        if (!item.before || !item.rule) continue;
        offer(item.own ? "g" : meta.corpus === "c" ? "c" : meta.stratum, item);
      } else {
        const alt = (a.alts || []).map((x) => x && x.pealim_id).find((p) => p && String(p) !== String(a.pealim_id));
        if (alt && reading(alt)) offer("k", Object.assign(base, { before: reading(alt), rule: reading(b.pealim_id), control: true }));
      }
    }
    RM.invalidatePlaces([sid]); store.delete(sid);
  }

  // Бен-Иегуда (кэш)
  const index = JSON.parse(fs.readFileSync(path.join(TMP, "corpus-index-v8.json"), "utf8"));
  let n = 0;
  for (const w of index.ready || []) {
    const p = path.join(TMP, "by", w.file.replace(/^works\//, ""));
    if (!fs.existsSync(p)) continue;
    const rows = (((JSON.parse(fs.readFileSync(p, "utf8")).library || {}).texts || [])[0] || {}).rows || [];
    const stratum = w.era === "haskalah" || w.era === "tehiya" ? "a" : "b";
    for (const r of rows) {
      const plain = String(r.hebrew_plain || "").trim(), c = plain && cache[plain];
      if (!c) continue;
      await scanRow("by:" + w.id + ":" + r.row_id, { he_plain: r.hebrew_plain, he_niqqud: r.hebrew_niqqud }, c.map(fromCache), { work: w.id, era: w.era, corpus: "by", stratum });
    }
    if (++n % 200 === 0) console.log("  BY " + n);
  }
  // Медиатека: разбор, который уже едет в снимках
  const pcDir = path.join(TMP, "pc");
  for (const slug of fs.readdirSync(pcDir).filter((f) => fs.statSync(path.join(pcDir, f)).isDirectory())) {
    for (const f of fs.readdirSync(path.join(pcDir, slug))) {
      const snap = (JSON.parse(fs.readFileSync(path.join(pcDir, slug, f), "utf8")).item || {}).snapshot || {};
      const rows = (((snap.library || {}).texts || [])[0] || {}).rows || [];
      const morph = new Map(((snap.notes_advanced || {}).sentence_morph || []).map((m) => [String(m.sentence_id), m.tokens]));
      for (const r of rows) {
        const toks = morph.get(String(r.row_id)); if (!toks || !toks.length) continue;
        await scanRow("pc:" + slug + ":" + f + ":" + r.row_id, { he_plain: r.hebrew_plain, he_niqqud: r.hebrew_niqqud }, toks, { work: slug + "/" + f, era: "", corpus: "c" });
      }
    }
  }

  // листы: варианты в случайном порядке; ключ отдельно
  const key = {}, sheets = { strata: [], control: [] }, counts = {};
  for (const s of Object.keys(res)) {
    counts[s] = { population: seen[s], sampled: res[s].length };
    res[s].forEach((it, i) => {
      const id = s + String(i + 1).padStart(3, "0");
      const ruleFirst = rnd() < 0.5;
      const opt = (x) => x.lemma + " — " + x.pos + " — «" + x.meaning + "»";
      const q = { id, sentence: it.sentence, word: it.word, option1: opt(ruleFirst ? it.rule : it.before), option2: opt(ruleFirst ? it.before : it.rule) };
      if (it.rule.lemma === it.before.lemma && it.rule.pos === it.before.pos && it.rule.meaning === it.before.meaning) q.note = "варианты могут совпадать";
      key[id] = Object.assign({ stratum: s, ruleOption: ruleFirst ? 1 : 2 }, it);
      (s === "k" ? sheets.control : sheets.strata).push(q);
    });
  }
  // перемешать порядок вопросов, чтобы страта не угадывалась по позиции
  const all = sheets.strata.concat(sheets.control);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const half = Math.ceil(all.length / 2);
  fs.writeFileSync(path.join(OUT, "sheet-1.json"), JSON.stringify(all.slice(0, half), null, 1));
  fs.writeFileSync(path.join(OUT, "sheet-2.json"), JSON.stringify(all.slice(half), null, 1));
  fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify({ seed: 20261017, quota: QUOTA, counts, key }, null, 1));
  console.log(JSON.stringify(counts));
}
main().catch((e) => { console.error(e); process.exit(1); });
