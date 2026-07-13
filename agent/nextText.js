"use strict";

// agent/nextText.js — PAS-D1: «что читать дальше» — LLM-объяснение ВЫБОРА текста
// (спека PAS_SLICE_D_SPEC_2026_07_12 v2 после критики wf_dd4bc294).
//
// Скоринг ДЕТЕРМИНИРОВАН и живёт на КЛИЕНТЕ (public/js/corpus-vocab.js — единственный
// движок i+1; серверное знание словаря ТОНЬШЕ клиентского [mark-axis + FSRS без
// note-overlay] — серверный ре-скоринг расходился бы с рельсой Зала, R11). Сервер
// НЕ доверяет клиенту текст: весь текстовый grounding деривится ЗДЕСЬ — карточка
// работы из corpus-index (public domain), глоссы frontier-лемм из keyingService
// (resolver-факты, R1), learner-контекст из графа. Клиент шлёт только иды и числа.
//
// BLOCKER-фикс критики (version-pin): версия каталога резолвится ИЗ ТОГО ЖЕ
// ИСТОЧНИКА, что у клиента и всех build-скриптов — regex CORPUS_CATALOG_VERSION по
// public/js/library-ui.js (совпадение по построению, feedback_config_string_match_
// by_construction). Захардкоженных имён файлов нет.
//
// zone НЕ принимается от клиента — сервер сам classifyZone(cov) тем же dual-export
// движком (тот же CFG по построению). cov вне [0,1] → 400 BAD_COV (НЕ clamp —
// невозможное значение = сигнал бага, тихая нормализация запрещена).
//
// frontier_pids — фронтир ЛОКАЛЬНОГО профиля устройства: сервер членство pid∈work
// не проверяет (919КБ vocab вне серверного hot-path) и ЧЕСТНО фреймит их в prompt
// и в ответе провенансом device_profile, не как серверный факт о тексте.
//
// R16: reserveLlmCall scenario='next_text'; kill-switch → честный отказ ДО reserve;
// повторный тап закрыт client-memo (ответ не персистится: advisory, класс A —
// только идентификаторы/числа, личный контент не участвует).

const fs = require("fs");
const path = require("path");
const tools = require(path.join(__dirname, "tools"));
const llm = require(path.join(__dirname, "llm"));
const llmGate = require(path.join(__dirname, "llmGate"));
const planner = require(path.join(__dirname, "planner"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));
const keyingService = require(path.join(__dirname, "..", "db", "keyingService"));
const corpusVocab = require(path.join(__dirname, "..", "public", "js", "corpus-vocab.js"));

const SCENARIO = "next_text";
const CATEGORY = "вернуть к чтению";   // R17-A: каноническая категория рекомендации чтения
const FRONTIER_MAX = 8;
const WORK_ID_RE = /^\d{1,8}$/;
const KINDS = new Set(["next", "challenge"]);

// ── версия каталога: по построению из library-ui.js (единственный источник) ────
let _catalogVersion = null;
function catalogVersion() {
  if (_catalogVersion != null) return _catalogVersion;
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "library-ui.js"), "utf8");
  const m = src.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/);
  if (!m) throw new Error("CORPUS_CATALOG_VERSION not found in library-ui.js");
  _catalogVersion = Number(m[1]);
  return _catalogVersion;
}

// ── corpus-index: lazy require-подобный кэш модуля (526КБ, git → Docker-образ) ──
let _index = null;   // Map<work_id, card>
function indexReady() {
  if (_index) return _index;
  const file = path.join(__dirname, "..", "public", "data", "benyehuda", "corpus-index-v" + catalogVersion() + ".json");
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const map = new Map();
  for (const c of (Array.isArray(j.ready) ? j.ready : [])) {
    if (c && c.id != null) map.set(String(c.id), c);
  }
  _index = map;
  return map;
}
function _resetForTest() { _index = null; _catalogVersion = null; }

async function _usage(userId) {
  try {
    const u = await agentRepo.usageToday(userId);
    return { user_llm_calls: u.user_llm_calls, limit: planner.limits().perUserDaily };
  } catch (_) { return null; }
}

// PURE (unit-гейт): system байт-стабилен per language; ВСЁ вариативное (kind,
// load-кавета, числа клиента) — строго в data-секции. R1-guard в system.
function buildNextTextPayload({ language, card, zone, cov, loadFlag, kind, frontier, learner }) {
  const system = language === "en"
    ? "You are the LinguistPro Hebrew mentor. The learner's reading engine deterministically picked a public-domain Hebrew text for them; your ONLY job is to explain WHY this text fits right now, in 2-5 short warm English sentences. Facts you may use are given as data: the work card (title/author/era/genre/length), the coverage number measured on the learner's OWN DEVICE profile (say 'about N% of the words are familiar to you' — it is a device-side estimate), the zone, and frontier words with resolver glosses. If data.kind is 'challenge', frame the text honestly as a stretch challenge slightly above their level, never as comfortable reading. If data.load_caveat is present, mention that the text carries many names/archaic words so the real load is higher than the coverage number. NEVER assert morphology (roots, binyanim, parts of speech) beyond the provided glosses, and NEVER invent facts about the plot. Output PLAIN PROSE ONLY: no backticks, no braces, no JSON, no field names."
    : "Ты — наставник LinguistPro по ивриту. Движок чтения детерминированно подобрал ученику текст из корпуса (public domain); твоя ЕДИНСТВЕННАЯ задача — объяснить, ПОЧЕМУ этот текст подходит именно сейчас, 2–5 короткими тёплыми фразами по-русски. Факты — только из data: карточка работы (название/автор/эпоха/жанр/объём), покрытие, замеренное на профиле УСТРОЙСТВА ученика (говори «примерно N% слов тебе знакомы» — это оценка с устройства), зона и frontier-слова с глоссами резолвера. Если data.kind = 'challenge' — подавай текст честно как вызов чуть выше уровня, НЕ как комфортное чтение. Если есть data.load_caveat — упомяни, что в тексте много имён/архаики и реальная нагрузка выше цифры покрытия. НИКОГДА не утверждай морфологию (корни, биньяны, части речи) сверх переданных глоссов и НИКОГДА не выдумывай факты о сюжете. Пиши ТОЛЬКО обычным текстом: без обратных кавычек, фигурных скобок, JSON и имён полей.";
  const prompt = JSON.stringify({
    language, kind,
    work: {
      title: card.title || null, author: card.author || null, era: card.era || null,
      genre: card.genre || null, segments: card.segments || null,
    },
    coverage_device_profile: Math.round(cov * 100) / 100,
    zone,
    ...(loadFlag ? { load_caveat: "many names/archaic tokens — real load higher than coverage" } : {}),
    frontier_device_profile: frontier.map((f) => ({ lemma: f.lemma, meaning: f.meaning || null })),
    learner: { due_now: learner.due_now, weak_count: learner.weak_count },
  });
  return { system, prompt };
}

// POST /api/agent/next-text/explain — единственный LLM-тап D1 («🤖 Почему?»).
async function explain(ctx, { pick } = {}) {
  const p = pick && typeof pick === "object" ? pick : {};
  const workId = String(p.work_id == null ? "" : p.work_id).trim();
  if (!WORK_ID_RE.test(workId)) return { ok: false, error: "UNKNOWN_WORK" };
  let card = null;
  try { card = indexReady().get(workId) || null; } catch (e) { return { ok: false, error: "INDEX_UNAVAILABLE" }; }
  if (!card) return { ok: false, error: "UNKNOWN_WORK" };
  const cov = Number(p.cov);
  if (!Number.isFinite(cov) || cov < 0 || cov > 1) return { ok: false, error: "BAD_COV" };
  const kind = String(p.kind || "");
  if (!KINDS.has(kind)) return { ok: false, error: "BAD_KIND" };
  const loadFlag = p.load_flag === true;
  const rawPids = Array.isArray(p.frontier_pids) ? p.frontier_pids : [];
  if (rawPids.length > FRONTIER_MAX) return { ok: false, error: "BAD_FRONTIER" };
  const pids = [];
  for (const x of rawPids) {
    const n = Number(x);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "BAD_FRONTIER" };
    pids.push(n);
  }

  // zone — серверная деривация тем же движком (клиентский zone не принимается)
  const zone = corpusVocab.classifyZone(cov);

  // grounding: глоссы frontier — resolver-факты (провенанс device_profile: фронтир
  // считал ЛОКАЛЬНЫЙ профиль устройства; сервер это честно фреймит, не перепроверяет)
  const frontier = [];
  for (const pid of pids) {
    const itemKey = "pid:" + pid;
    let lemma = null, meaning = null;
    try { lemma = await keyingService.displayForItemKey(itemKey); } catch (_) {}
    try {
      const g = await keyingService.glossForItemKey(itemKey);
      if (g && g.meaning) meaning = String(g.meaning).slice(0, 80);
      else if (g && g.gloss) meaning = String(g.gloss).slice(0, 80);
    } catch (_) {}
    if (lemma) frontier.push({ pid, lemma, ...(meaning ? { meaning } : {}) });
  }

  // learner-контекст из графа (идентификаторы/числа; consent не нужен — артефакты не читаются)
  let learner = { due_now: 0, weak_count: 0 };
  try {
    const lc = await tools.callTool(ctx, "get_learner_context", {});
    if (lc.ok && lc.result && lc.result.counts) {
      learner = { due_now: Number(lc.result.counts.due_now) || 0, weak_count: (lc.result.weak_sample || []).length };
    }
  } catch (_) {}

  const profile = await agentRepo.getProfile(ctx.userId);
  const language = (profile && profile.language) || "ru";

  // PAS-F1: единый гейт killSwitch→(reserve|byok)→generate→finalize (agent/llmGate).
  // Hard-fail класс: BYOK_FAILED → честный код (502), без серверного фолбэка.
  const pp = buildNextTextPayload({ language, card, zone, cov, loadFlag, kind, frontier, learner });
  const g = await llmGate.gatedGenerate(ctx, { scenario: SCENARIO, system: pp.system, prompt: pp.prompt, maxOutputTokens: 512 });
  if (g.phase === "kill") return { ok: false, error: "KILL_SWITCH", usage: await _usage(ctx.userId) };
  if (g.phase === "reserve") return { ok: false, error: g.reason, usage: await _usage(ctx.userId) };
  if (g.phase === "byok") return { ok: false, error: "BYOK_FAILED", provider_error: g.provider_error, usage: await _usage(ctx.userId) };
  if (g.phase === "generate") return { ok: false, error: g.reason, usage: await _usage(ctx.userId) };
  const out = g.out;
  if (!planner.isCleanProse(out.text)) return { ok: false, error: "LLM_OUTPUT_INVALID", usage: await _usage(ctx.userId) };

  // Ничего не персистится: advisory-ответ класса A (повтор закрыт client-memo).
  return {
    ok: true, category: CATEGORY, language, advisory: true,
    text: out.text, provider: out.provider, model: out.model,
    ...(g.key_source === "byok" ? { key_source: "byok" } : {}),
    grounding: {
      title: card.title || null, author: card.author || null, zone,
      frontier: frontier.map((f) => ({ pid: f.pid, lemma: f.lemma, ...(f.meaning ? { meaning: f.meaning } : {}) })),
      frontier_provenance: "device_profile",
    },
    usage: await _usage(ctx.userId),
  };
}

module.exports = { explain, buildNextTextPayload, catalogVersion, SCENARIO, FRONTIER_MAX, _resetForTest };
