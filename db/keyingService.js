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
  _glossIndex = null;
  _vocFormIndex = null;
  _phonIndex = null;
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

// ── P7.2a reverse:tg — gloss/synonym-индекс (чистая деривация из уже-загруженного датасета) ──
// Тот же датасет pealim-infl-v12 несёт RU-глосс (.meaning) на парадигму. Строим:
//   • pidGloss   pid → meaning (RU)
//   • lemmaPos   stripNiqqud(lemma)#pos → [pid]  (обратный item_key→pid)
//   • senseLemmas нормализованный-сенс → Set(stripNiqqud(lemma))  = набор СИНОНИМОВ (§3)
// Нормализация глосса — байт-в-байт с замером (docs/research/telegram-p72-gloss-ambiguity).
const _GLOSS_ENUM_RE = /[\/,;]| или | и | либо /;
const HEB_ONLY_RE = /^[֐-׿\s]+$/;   // ожидаемая форма — только ивритские буквы (без транслита)
function _normGloss(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\([^)]*\)/g, " ")
    .replace(/[.]/g, " ").replace(/\s+/g, " ").trim();
}
function _glossSenses(g) { return _normGloss(g).split(_GLOSS_ENUM_RE).map((x) => x.trim()).filter((x) => x.length >= 2); }
let _glossIndex = null;
function _buildGlossIndex(ds) {
  if (_glossIndex) return _glossIndex;
  const pidGloss = new Map(), lemmaPos = new Map(), senseLemmas = new Map();
  for (const p of (ds && ds.paradigms) || []) {
    if (!p || !p.lemma) continue;
    const lemStrip = LC.stripNiqqud(p.lemma);
    if (p.pealim_id != null && p.meaning && !pidGloss.has(String(p.pealim_id))) pidGloss.set(String(p.pealim_id), String(p.meaning));
    if (p.pos) {
      const lk = lemStrip + "#" + String(p.pos).toLowerCase();
      let arr = lemmaPos.get(lk); if (!arr) { arr = []; lemmaPos.set(lk, arr); }
      if (p.pealim_id != null) arr.push(String(p.pealim_id));
    }
    for (const sn of _glossSenses(p.meaning)) {
      let set = senseLemmas.get(sn); if (!set) { set = new Set(); senseLemmas.set(sn, set); }
      set.add(lemStrip);
    }
  }
  _glossIndex = { pidGloss, lemmaPos, senseLemmas };
  return _glossIndex;
}

// ── P7.2b cloze — ВОКАЛИЗОВАННЫЙ форм-индекс (огласованная форма → Set(pid)), для forward-матча
// «due-лемма → её формы → искать в тексте пользователя» (resolveWord НЕ ключует голые поверхности
// без Dicta — замер 2026-07-07). Матч по ОГЛАСОВАННОЙ форме (не консонантному skeleton):
// niqqud различает омографы (כָּתַב «написал» vs כְּתָב «письменность») — критика: dataset-уникальность
// skeleton ≠ контекстная дизамбигуация. unambiguous = ВОКАЛИЗОВАННАЯ форма → РОВНО один pid глобально.
let _vocFormIndex = null;
function _cellForms(cells) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (o.he) out.push(String(o.he));
    for (const k in o) if (k !== "he" && k !== "translit" && k !== "translit_html") walk(o[k]);
  })(cells);
  return out;
}
// нормализация огласованной формы (снять пробелы; niqqud СОХРАНЯЕМ)
function _normVoc(f) { return String(f == null ? "" : f).replace(/\s+/g, "").trim(); }
function _buildVocFormIndex(ds) {
  if (_vocFormIndex) return _vocFormIndex;
  const m = new Map();   // vocForm → Set(pid)
  for (const p of (ds && ds.paradigms) || []) {
    if (!p || p.pealim_id == null) continue;
    const pid = String(p.pealim_id);
    const forms = _cellForms(p.cells);
    if (p.lemma_niqqud) forms.push(p.lemma_niqqud);
    for (const f of forms) {
      const v = _normVoc(f);
      if (!v || LC.stripNiqqud(v).length < 2) continue;
      let set = m.get(v); if (!set) { set = new Set(); m.set(v, set); }
      set.add(pid);
    }
  }
  _vocFormIndex = m;
  return m;
}

// ── P7.2c dictate — ОМОФОН-ИНДЕКС (звук → написание), критика wf_6732a80f BLOCKER ─────────────────
// Аудио-диктант принципиально НЕ задаёт написание, если у слова есть омофон с ДРУГИМ написанием
// (звук→одно написание иначе ложный lapse). Порт docs/research/dictate-homophone-coverage/2026-07-07/
// measure.js (замер: ~78% лемм проходят): фонемная транскрипция = коллапс омофон-согласных классов
// (ת/ט→t, {ק,כ,ח}→k, {ס,ש}→s, {א,ע,ה}→∅, {ב,ו}→v, matres י→∅, финальные→базовые) + niqqud-гласные.
// Индекс строится по ОГЛАСОВАННЫМ ЛЕММАМ всех парадигм (тот же лексикон, что в замере) — ключ
// фонема → Set(консонантных скелетов). Lazy, invalidate в unloadNow как прочие индексы.
const _D_VOWEL = { "ָ": "a", "ַ": "a", "ֵ": "e", "ֶ": "e", "ִ": "i", "ֹ": "o", "ֻ": "u", "ְ": "" };
const _D_FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function _consPhon(ch) {
  if (ch === "ט" || ch === "ת") return "t";                       // ט,ת → /t/
  if (ch === "ק" || ch === "כ" || ch === "ח") return "k";    // ק,כ,ח (kaf-family, over-merge)
  if (ch === "ס" || ch === "ש") return "s";                       // ס,ש → /s/ (over-merge shin)
  if (ch === "א" || ch === "ע" || ch === "ה") return "";     // א,ע,ה глоттали/немые → drop
  if (ch === "ב" || ch === "ו") return "v";                       // ב,ו → /v/ (ו mater тоже)
  if (ch === "י") return "";                                            // י mater → drop
  return ch;                                                                 // прочие согласные — как есть
}
function _phon(vocalized) {
  let out = "";
  for (let ch of String(vocalized || "")) {
    if (_D_FINAL[ch]) ch = _D_FINAL[ch];
    if (_D_VOWEL[ch] != null) { out += _D_VOWEL[ch]; continue; }
    if (ch === "ּ" || ch === "ֽ" || /[֑-֯׀-ׇ]/.test(ch)) continue; // dagesh/teamim/пункт
    if (/[א-ת]/.test(ch)) { out += _consPhon(ch); continue; }
    // прочее (пробел и т.п.) — drop
  }
  return out;
}
let _phonIndex = null;
function _buildPhonemeIndex(ds) {
  if (_phonIndex) return _phonIndex;
  const m = new Map();   // фонема → Set(консонантных скелетов)
  for (const p of (ds && ds.paradigms) || []) {
    if (!p || !p.lemma_niqqud) continue;
    const v = _normVoc(p.lemma_niqqud);
    const ph = _phon(v);
    const sk = LC.stripNiqqud(v);
    if (!ph || !sk) continue;
    let s = m.get(ph); if (!s) { s = new Set(); m.set(ph, s); }
    s.add(sk);
  }
  _phonIndex = m;
  return m;
}

// clozeFormsForItemKey(itemKey) → { pid, forms:[{voc, skeleton, unambiguous}] } | null.
// ВОКАЛИЗОВАННЫЕ формы парадигмы due-леммы (voc = огласованная, для точного матча против токена
// текста пользователя); unambiguous = voc маппится глобально на один pid (омографы с ДРУГОЙ
// огласовкой не коллизируют). skeleton — для buildClozeForTarget (бланк по консонантному скелету).
async function clozeFormsForItemKey(itemKey) {
  const g = await glossForItemKey(itemKey);
  if (!g || !g.sense_id) return null;
  const b = await ensureLoaded();
  const fi = _buildVocFormIndex(b.ds);
  const p = ((b.ds && b.ds.paradigms) || []).find((x) => x && String(x.pealim_id) === String(g.sense_id));
  if (!p) return null;
  const raw = _cellForms(p.cells);
  if (p.lemma_niqqud) raw.push(p.lemma_niqqud);
  const seen = new Set(), forms = [];
  for (const f of raw) {
    const v = _normVoc(f);
    const sk = LC.stripNiqqud(v);
    if (!v || sk.length < 2 || seen.has(v)) continue;
    seen.add(v);
    const set = fi.get(v);
    forms.push({ voc: v, skeleton: sk, unambiguous: !!(set && set.size === 1) });
  }
  return { pid: String(g.sense_id), forms };
}

// P7.2c dictate — { vocalized (огласованная лемма для аудио/assetKey), written (консонантная —
// expected написание), pid } | null. Диктуем СЛОВАРНУЮ форму (лемму). Требуем: decisive (один pid),
// lemma_niqqud есть, vocalized-лемма ГЛОБАЛЬНО однозначна по огласовке (_vocFormIndex → один pid) —
// иначе звук неоднозначен по написанию (омофон/омограф) → мис-спеллинг = ложный lapse (критика уточнит).
async function dictateFormForItemKey(itemKey) {
  const g = await glossForItemKey(itemKey);
  if (!g || !g.sense_id || !g.decisive) return null;
  const b = await ensureLoaded();
  const fi = _buildVocFormIndex(b.ds);
  const p = ((b.ds && b.ds.paradigms) || []).find((x) => x && String(x.pealim_id) === String(g.sense_id));
  if (!p || !p.lemma_niqqud) return null;
  const vocalized = _normVoc(p.lemma_niqqud);
  const written = LC.stripNiqqud(vocalized);
  // P7.2d (owner + live-verify 2026-07-08): мин. письменной длины ≥3. 2-буквенные слова (85 лемм =
  // 1.23%; замер scripts/premium/measure-dictate-length-pos.js — 74 content вкл. владельческий פן) —
  // плохие цели аудио-диктанта (сигнал слишком мал, «Ожидалось: 2 буквы» несправедливо). ЕДИНАЯ точка
  // фильтра → сервер-селектор + bake + оракул-гейт согласованы ПО ПОСТРОЕНИЮ (2-букв → null обеими).
  if (!written || written.length < 3 || !HEB_ONLY_RE.test(written)) return null;
  const set = fi.get(vocalized);
  if (!(set && set.size === 1)) return null;   // огласованная лемма неоднозначна глобально → skip
  // ОМОФОН-ФИЛЬТР (критика wf_6732a80f BLOCKER): звук слова должен задавать РОВНО одно написание в
  // лексиконе — иначе диктант принципиально неоднозначен (омофон с другим написанием) и мис-спеллинг
  // на самом деле ВЕРНОЕ слово-омофон = ложный lapse. Замер: ~78% лемм проходят (results.txt).
  const pi = _buildPhonemeIndex(b.ds);
  const sp = pi.get(_phon(vocalized));
  if (!(sp && sp.size === 1)) return null;     // звук → >1 написание → dictate НЕ eligible
  return { vocalized, written, pid: String(g.sense_id) };
}

// glossForItemKey → { sense_id, gloss, expected (HE-лемма стрип), decisive, alts:[HE-леммы синонимов] }
// или null (нерезолвимо / нет глосса). decisive = ровно один pealim_id за item_key (не гомограф).
// alts = леммы, делящие ЛЮБОЙ сенс глосса (синоним-набор §3), кроме собственной.
async function glossForItemKey(itemKey) {
  const k = String(itemKey || "");
  const b = await ensureLoaded();
  const gi = _buildGlossIndex(b.ds);
  let pids = [];
  if (k.startsWith("pid:")) {
    pids = [k.slice(4)];
  } else {
    const i = k.indexOf("#");
    if (i <= 0) return null;
    const lemStrip = LC.stripNiqqud(k.slice(0, i));
    const pos = k.slice(i + 1).toLowerCase();
    pids = gi.lemmaPos.get(lemStrip + "#" + pos) || [];
    if (!pids.length) {
      // fallback: любой pos с той же леммой (item_key pos может отличаться от датасетного)
      for (const [lk, arr] of gi.lemmaPos) if (lk.slice(0, lk.indexOf("#")) === lemStrip) { pids = pids.concat(arr); }
    }
  }
  const uniq = [...new Set(pids)];
  if (!uniq.length) return null;
  const senseId = uniq[0];
  const gloss = gi.pidGloss.get(senseId);
  if (!gloss || !String(gloss).trim()) return null;
  const expected = await displayForItemKey(k);   // HE-форма (лемма)
  const expStrip = LC.stripNiqqud(expected);
  // decisive: один pid ИЛИ все pid дают тот же нормализованный глосс (истинно один sense)
  const glosses = new Set(uniq.map((pid) => _normGloss(gi.pidGloss.get(pid) || "")));
  const decisive = uniq.length === 1 || glosses.size === 1;
  // синоним-набор (для strictSafe-детекта): HE-леммы, делящие любой сенс глосса, минус собственная
  const alts = new Set();
  for (const sn of _glossSenses(gloss)) for (const lem of (gi.senseLemmas.get(sn) || [])) if (lem !== expStrip) alts.add(lem);
  // P7.2a вариант A (owner 2026-07-07): строгий reverse ТОЛЬКО на однозначных словах — синоним-карта
  // из свободного глосса ненадёжна (критика wf_15f4c1ae). strictSafe = decisive · один сенс без
  // перечисления · нет коллизии (никакая другая лемма не делит сенс) · глосс ≤3 слов. Для таких
  // слов валидных альтернатив НЕТ по построению → wrong честен, синоним-приём не нужен.
  const glossSenses = _glossSenses(gloss);
  const strictSafe = decisive && glossSenses.length === 1 && alts.size === 0 &&
    gloss.split(/\s+/).filter(Boolean).length <= 3 && !!expStrip && HEB_ONLY_RE.test(expStrip);
  return { sense_id: senseId, gloss: String(gloss), expected, decisive, strictSafe, alts: [...alts] };
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

module.exports = { resolveWord, resolveWords, ensureLoaded, unloadNow, status, displayForItemKey, glossForItemKey, clozeFormsForItemKey, dictateFormForItemKey, MAX_WORDS, RESOLVER_ID };
