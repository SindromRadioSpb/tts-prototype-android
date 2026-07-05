"use strict";

// db/keyingService.js — CLG-P6 prep: серверный keying/resolver-стек (AI_MENTOR_RECON §7
// «Границы item_key», §15.7.2). Порт браузерного стека в Node НА ТЕХ ЖЕ pure-модулях —
// parity by construction (паттерн learnerProjectionRepo: require ТОГО ЖЕ файла, что бежит
// в браузере):
//   public/js/notes-autogen.js  — resolver-core (lock-step с build-notes-from-bundle)
//   public/js/lemma-canon.js    — THE канонический кейер (KEYER_VERSION)
//   public/data/inflection/pealim-infl-v12.json.gz       — офлайн-словарь (9279 парадигм)
//   public/data/inflection/pealim-function-links.v1.json — pid-карта служебных слов
// Независимость подтверждает ГЕЙТ (smoke:server-keying): ключи, выведенные здесь, диффятся
// против reference-бандла build-notes — артефакта, который этот модуль не производил.
//
// Резолв-цепочка = клиентский оркестратор (_v3AutoGenResolveItem, index.html):
//   unit → pickBaseParadigm(idxLookup) → resolveContentUnit → function-links профиль →
//   assembleBody → LemmaCanon.canonKey (канон Зала save==paint) / noteKey (канон word-card).
//
// R16 (замер 2026-07-05): датасет + resolver-карты ≈ 306 MB RSS, загрузка ~0.8–2 с →
// НЕ резидентно (контейнер 1536 MB делится с TTS). Lazy-load при первом resolve +
// idle-выгрузка (env KEYING_IDLE_UNLOAD_MS, деф. 5 мин, мин. 30 с).
//
// R1/R10-честность: нерешаемое слово → item_key:null (мусорный ключ не минтится — зеркало
// LemmaCanon.noteKey refuse-семантики); гомограф → ambiguous:true + alts (по построению
// не может претендовать на «точно»). DB этот модуль НЕ трогает.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..");
const NA = require(path.join(REPO, "public", "js", "notes-autogen.js"));
const LC = require(path.join(REPO, "public", "js", "lemma-canon.js"));

const GZ_PATH = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");
const LINKS_PATH = path.join(REPO, "public", "data", "inflection", "pealim-function-links.v1.json");

const MAX_WORDS = 50;
const RESOLVER_ID = "server-keying-v1";
const SWEEP_EVERY_MS = 30_000;

function idleUnloadMs() {
  return Math.max(30_000, Number(process.env.KEYING_IDLE_UNLOAD_MS) || 300_000);
}

let _bundle = null;    // { ds, maps, links, modelVersion, loadedAtMs, loadMs }
let _loading = null;   // in-flight load promise (single-flight)
let _lastUsedMs = 0;
let _sweeper = null;
let _pidLemmaIndex = null;   // pealim_id -> lemma (display name), built once per bundle load

// Зеркало браузерного pealim-function-links.js (lookup/getForm): surface → Dicta-stem →
// lemma, POS-совпадение предпочитается, иначе same-spelling fallback. Файл опционален —
// его отсутствие деградирует ровно как в браузере (поиск-фолбэк, не ошибка).
function _makeLinks(raw) {
  const map = (raw && raw.links) || {};
  const forms = (raw && raw.forms) || {};
  const sp = (s) => String(s == null ? "" : s).replace(/[֑-ׇ]/g, "").trim();
  return {
    lookup(word, pos, extra) {
      const keys = [sp(word), sp(extra && extra.stem), sp(extra && extra.lemma)];
      let fallback = null;
      for (const k of keys) {
        if (!k) continue;
        const e = map[k];
        if (!e) continue;
        if (!pos || !e.pos || e.pos === pos) return e;
        if (!fallback) fallback = e;
      }
      return fallback;
    },
    getForm(id) { return id == null ? null : (forms[String(id)] || null); },
  };
}

// Идентичный read-path клиентскому getLemmaInflection: OPFS-строки bulk-импортированы
// из того же gz `index` (key = "<lemma|root> <binyan>") — см. autogen-parity-smoke.
function _idxLookup(ds, key, binyan) {
  if (!key) return null;
  const i = ds.index[String(key) + " " + String(binyan || "")];
  return (i != null && ds.paradigms[i]) ? ds.paradigms[i] : null;
}

function _startSweeper() {
  if (_sweeper) return;
  _sweeper = setInterval(() => {
    if (_bundle && Date.now() - _lastUsedMs > idleUnloadMs()) unloadNow();
  }, SWEEP_EVERY_MS);
  if (_sweeper.unref) _sweeper.unref();
}

async function ensureLoaded() {
  _lastUsedMs = Date.now();
  if (_bundle) return _bundle;
  if (_loading) return _loading;
  _loading = (async () => {
    const t0 = Date.now();
    const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(GZ_PATH)).toString("utf8"));
    if (!ds || !ds.index || !Array.isArray(ds.paradigms)) throw new Error("KEYING_DATASET_MALFORMED");
    const maps = NA.buildResolverMaps(ds.paradigms);
    let linksRaw = null;
    try { linksRaw = JSON.parse(fs.readFileSync(LINKS_PATH, "utf8")); } catch (_) { /* optional, как в браузере */ }
    _bundle = {
      ds, maps, links: _makeLinks(linksRaw),
      modelVersion: ds.model_version || "pealim-infl-v12",
      loadedAtMs: Date.now(), loadMs: Date.now() - t0,
    };
    _startSweeper();
    return _bundle;
  })().finally(() => { _loading = null; });
  return _loading;
}

function unloadNow() {
  const was = !!_bundle;
  _bundle = null;
  _pidLemmaIndex = null;
  return was;
}

function _pidLemma(ds) {
  if (_pidLemmaIndex) return _pidLemmaIndex;
  const m = new Map();
  for (const p of (ds && ds.paradigms) || []) {
    if (p && p.pealim_id != null && p.lemma && !m.has(String(p.pealim_id))) m.set(String(p.pealim_id), p.lemma);
  }
  _pidLemmaIndex = m;
  return m;
}

// Дисплейная форма item_key для UX-поверхностей (например, /plan): '<lemma>#<pos>' →
// лемма прямо из ключа (дёшево, без датасета); 'pid:<N>' → лемма из paradigms[].lemma
// (1:1 с pealim_id, огласована — проверено на реальных pid владельца 2026-07-05) через
// function-links (служебные слова) как первый источник, затем полный словарь. Честный
// фолбэк — сырой ключ, форму НИКОГДА не выдумываем (R1).
async function displayForItemKey(itemKey) {
  const k = String(itemKey || "");
  if (!k.startsWith("pid:")) {
    const i = k.indexOf("#");
    return i > 0 ? k.slice(0, i) : k;
  }
  const pid = k.slice(4);
  const b = await ensureLoaded();
  const f = b.links.getForm(pid);
  if (f && f.he) return f.he;
  const lem = _pidLemma(b.ds).get(pid);
  return lem || k;
}

// Вход → resolution-unit. dicta_token (объект из sentence_morph) идёт через канонический
// NA.dictaTokenToUnit; голый surface(+niqqud/pos/binyan/lemma/stem) — через его же
// byte-семантику (включая refuse одно-буквенных: честное «не ключуется», не догадка).
function _unitFromInput(w) {
  if (w && w.dicta_token && typeof w.dicta_token === "object") {
    const u = NA.dictaTokenToUnit(w.dicta_token);
    if (u) return u;
  }
  const sp = NA.stripNiqqud;
  const surface = String((w && (w.surface != null ? w.surface : w.word)) || "");
  const word = sp(surface);
  if (!word || word.length < 2) return null;
  const lemma = sp((w && (w.lemma || w.stem)) || "");
  const stem = sp((w && w.stem) || "");
  const binyan = String((w && w.binyan) || "");
  let pos = String((w && w.pos) || "");
  if (!pos && binyan && lemma) pos = "verb";
  const kind = w && w.kind;
  const root = (NA.FUNCTION_POS.has(pos) || kind === "propernoun") ? null
    : ((pos === "verb" || pos === "noun") ? (lemma || null) : null);
  return { pos, binyan, root, lemma, stem, niqqud: String((w && w.niqqud) || ""), sampleWord: word, kind };
}

async function resolveWord(input) {
  const b = await ensureLoaded();
  _lastUsedMs = Date.now();
  const surface = String((input && (input.surface != null ? input.surface : input.word)) || "");
  const unit = _unitFromInput(input || {});
  if (!unit) return { surface, keyable: false, item_key: null, reason: "unresolvable_surface" };

  const base = await NA.pickBaseParadigm(unit, (k, bn) => _idxLookup(b.ds, k, bn));
  const resolved = NA.resolveContentUnit(b.maps, unit, base);

  // Зеркало клиентского function-links слоя (_v3AutoGenResolveItem): прямой Pealim-pid
  // для служебного/неклассифицированного слова + инвариантная огласованная форма.
  if (!resolved.pealim_id && (NA.FUNCTION_POS.has(unit.pos) || !unit.pos)) {
    const fe = b.links.lookup(unit.sampleWord, unit.pos, { stem: unit.stem, lemma: unit.lemma });
    if (fe && fe.id) {
      resolved.pealim_id = String(fe.id);
      const form = b.links.getForm(fe.id);
      if (form && form.he && !unit.niqqud) unit.niqqud = form.he;
      if (resolved.confidence < 0.75) resolved.confidence = 0.75;
      if (resolved.status === "review") resolved.status = "ok";
    }
  }

  const body = NA.assembleBody(unit, resolved);
  const noteKey = LC.noteKey(body) || null;
  const canonKey = LC.canonKey(
    NA,
    { pealim_id: body.pealim_id, lemma: body.lemma, word: body.word, pos: body.pos },
    unit.niqqud, surface, b.links
  ) || null;
  const itemKey = canonKey || noteKey;

  const out = {
    surface,
    item_key: itemKey,
    keyable: !!itemKey,
    confidence: resolved.confidence,
    status: resolved.status,
    ambiguous: !!resolved.ambiguous,
    alts: resolved.ambiguous ? (resolved.alts || []) : [],
    channel: resolved.channel,
    body,
  };
  if (noteKey && canonKey && noteKey !== canonKey) out.note_key = noteKey;   // честный флаг расхождения путей
  if (!itemKey) out.reason = "unkeyable";
  return out;
}

// Пачка — per-item best-effort: одна кривая запись не абортит остальные
// (feedback_silent_batch_partial_failure), ошибка видна в её собственном результате.
async function resolveWords(words) {
  const list = (Array.isArray(words) ? words : []).slice(0, MAX_WORDS);
  const results = [];
  for (const w of list) {
    try { results.push(await resolveWord(w)); }
    catch (e) {
      results.push({
        surface: String((w && (w.surface != null ? w.surface : w.word)) || ""),
        keyable: false, item_key: null, reason: "error:" + ((e && e.message) || "resolve"),
      });
    }
  }
  return {
    model_version: _bundle ? _bundle.modelVersion : null,
    keyer_version: LC.KEYER_VERSION,
    resolver: RESOLVER_ID,
    results,
  };
}

function status() {
  return {
    loaded: !!_bundle,
    model_version: _bundle ? _bundle.modelVersion : null,
    keyer_version: LC.KEYER_VERSION,
    resolver: RESOLVER_ID,
    load_ms: _bundle ? _bundle.loadMs : null,
    loaded_at: _bundle ? new Date(_bundle.loadedAtMs).toISOString() : null,
    last_used_at: _lastUsedMs ? new Date(_lastUsedMs).toISOString() : null,
    idle_unload_ms: idleUnloadMs(),
    max_words: MAX_WORDS,
  };
}

module.exports = { resolveWord, resolveWords, ensureLoaded, unloadNow, status, displayForItemKey, MAX_WORDS, RESOLVER_ID };
