"use strict";

// CLG-P8.3 — channel-neutral review-session service (TELEGRAM_MINI_APP_P8_3_SPEC §3, §8-v2).
// Шаг 1 extraction: селектор selectEligible ПЕРЕНЕСЁН СЮДА из agent/telegram/review.js
// (чистый перенос, parity-гейт = telegram-selector/review/cloze/dictate зелёные), бот
// делегирует. Шаг 2 (в этом же доме): единый due-snapshot —
//   • REVIEW_DUE_WINDOW=50 — ОДНА константа окна (была: selector limit:50 в review.js:92
//     И НЕЗАВИСИМЫЙ MAX_DUE_FORMS=40 в agentClozeRepo → доказанная §2.3-пробой потеря 4
//     якорных слов при пуле 50; builder теперь получает ТО ЖЕ окно);
//   • exposure МАТЕРИАЛИЗОВАН одним запросом на одном nowMs (recentlyExposedSet) —
//     selector и cloze-скан видят один exposure-мир, per-item дрейф времени исключён;
//   • struggleSet уже был одноразовым снимком — сохранён.
// start/answer/skip/annul/hint появляются следующими шагами P8.3/P8.4 (§9-адъюдикация).

const path = require("path");
const agentChallengeRepo = require(path.join(__dirname, "..", "db", "agentChallengeRepo"));
const agentClozeRepo = require(path.join(__dirname, "..", "db", "agentClozeRepo"));
const keyingService = require(path.join(__dirname, "..", "db", "keyingService"));
const learnerGraphRepo = require(path.join(__dirname, "..", "db", "learnerGraphRepo"));
const learnerLogRepo = require(path.join(__dirname, "..", "db", "learnerLogRepo"));
const GP = require(path.join(__dirname, "..", "public", "js", "grade-policy"));
const FC = require(path.join(__dirname, "..", "public", "js", "fsrs-core"));
const audioRepo = require(path.join(__dirname, "..", "db", "audioRepo"));
const { computeDictateAssetKey } = require(path.join(__dirname, "..", "db", "premium", "ttsAssetKey"));

// §2-v2: одно окно для селектора И builder'а. Расширение 40→50 для cloze — НАМЕРЕННОЕ
// исправление (§9 п.11): выбор cloze остаётся sentence-scan-order-first ВНУТРИ окна.
const REVIEW_DUE_WINDOW = 50;

// dictate keyless-раздача: аудио отдаётся Telegram'у по публичному https-URL (Telegram сам фетчит
// keyless /api/audio/:key). БЕЗ валидного https base диктант НЕ eligible (fail-closed, НЕ тихо —
// селектор логирует и падает на reverse). Серверного TTS-ключа нет (owner-инвариант): синтез офлайн.
function publicBaseUrl() {
  const b = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s]+$/.test(b) ? b : null;
}
function audioUrlFor(assetKey) {
  const base = publicBaseUrl();
  return base ? base + "/api/audio/" + String(assetKey) : null;
}

// P7.2d premium selector — выбор модальности SCORE-BASED по состоянию навыка + провенанс причины
// (select_reason). ДЕТЕРМИНИРОВАН из состояния (R17: LLM не выбирает — объяснение статично по коду).
// Порядок сложности (критика wf_58b7c1d6): cloze (context-cued) < dictate (audio-cued) < reverse
// (uncued gloss→word, САМАЯ тяжёлая). Тир-лестница (по убыванию приоритета):
//   1) FLAGSHIP reading→dictation gap: слово НЕТТО-сильное в чтении, НИКОГДА не диктованное,
//      не горящее, dictate-eligible → dictate (единственное место, где gap перебивает cloze-first);
//   2) cloze (мягчайший, context-cued) — struggle? cued-объяснение;
//   3) dictate (любой готовый ассет; audio-cued — средняя сложность);
//   4) reverse strictSafe (uncued — последним);
//   5) ничего. Cooldown/анти-старвация сохранены; dictate-eligibility мемоизирована (один дорогой
//   вызов на item; критика R11 cost — flagship дёшево пре-фильтрует до дорогого скана).
// dictateProven НЕ берём из channel_stats.production (полосуется клиентскими reverse/cloze без
// evidence_scope — критика R17 ВЕРИФИЦИРОВАНА library-ui.js) → history ТОЛЬКО из itemRows +
// grade-policy channelPrefix-сегментации.
async function selectEligible(userId, { nowMs, allocationMode } = {}) {
  const now = Number(nowMs) || Date.now();
  let items = await learnerGraphRepo.getDue(userId, { nowMs: now, limit: REVIEW_DUE_WINDOW, withChannelStats: true });
  // §7 ReviewAllocationPolicy v1 (reading-first-v1, замер 2026-07-09): reading_first оставляет
  // Mini App'у almost-lapsed пул (lapses≥1 ИЛИ stability<1, ~15/51 на owner-профиле), здоровые
  // due резервируются чтению; all_due = явный override пользователя. Фильтр ДО селектора,
  // ranking селектора не меняется. Бот не передаёт mode → поведение бота нетронуто (parity).
  if (allocationMode === "reading_first") items = (items || []).filter(almostLapsed);
  const dueKeys = (items || []).map((it) => it.item_key);
  // §9 п.9: exposure — материализованный снимок на ОДНОМ nowMs (selector и builder видят одно).
  const exposedSet = await agentChallengeRepo.recentlyExposedSet(userId, dueKeys, now);
  const isExposed = (k) => exposedSet.has(String(k));
  // ПОЛНЫЙ struggle-Set (не ranked top-N — критика R2/R11): горящее due-слово за пределами cap не должно
  // молча flagship-промотиться. 24ч, ≥2 провала.
  const struggleSet = await learnerGraphRepo.recentStruggleKeySet(userId, { minFails: 2 });

  const base = publicBaseUrl();
  if (!base) {
    // fail-closed ГРОМКО (критика wf_596df7f6): без https base диктант выключен — оператор видит ПРИЧИНУ.
    console.log("[tg-review] dictate off: PUBLIC_BASE_URL unset/not-https (audio review disabled)");
  }

  // мемоизированная dictate-eligibility (дорого: dictateFormForItemKey O(N) + hasAsset). null = не
  // eligible (омофон/неоднозначно/нет ассета/exposed/2-букв). Один вызов на item_key — переиспользуется
  // шагами 1/3 (тот же !isExposed-фильтр во всех проходах → нет дрейфа).
  const dictCache = new Map();
  let dNoAsset = 0;
  async function dictateEligible(itemKey) {
    if (dictCache.has(itemKey)) return dictCache.get(itemKey);
    let out = null;
    if (base && !isExposed(itemKey)) {
      let d = null;
      try { d = await keyingService.dictateFormForItemKey(itemKey); } catch (_) { d = null; }
      if (d) {
        const assetKey = computeDictateAssetKey(d.vocalized);
        let ready = false;
        try { ready = await audioRepo.hasAsset(assetKey); } catch (_) { ready = false; }
        if (ready) out = { kind: "dictate", item_key: itemKey, vocalized: d.vocalized, written: d.written,
                           assetKey, url: audioUrlFor(assetKey), sense_id: d.pid };
        else dNoAsset++;   // dictate-безопасно, но ассет не запечён → ops-сигнал ниже
      }
    }
    dictCache.set(itemKey, out);
    return out;
  }

  // readingStrong (дёшево, из channel_stats.receptive — рецептив НЕ полосуется production'ом). Слово
  // ВЫБИРАЕТСЯ потому что DUE (частично забыто) → одиночный старый good не «знаком при чтении» (критика
  // diff wf_8cd4658d MAJOR, converged 3 линзы). НЕТТО-сильно И недавно-успешно: good≥2 · good перевешивает
  // ВСЕ трудности (again+hard, не только again) · последний рецептив-грейд успешен (≥3 — channel_stats
  // кумулятивен, last_grade даёт свежесть, консистентно с тем, что слово due).
  function readingStrong(it) {
    const r = it && it.channel_stats && it.channel_stats.receptive;
    return !!(r && r.good >= 2 && r.good > (r.again || 0) + (r.hard || 0) && Number(r.last_grade) >= 3);
  }
  // когда-либо диктовал это слово (audio→написание)? modality-сегментировано (channelPrefix==='dictate'
  // ловит и dictate:tg, и клиентский Studio 'dictate'; НЕ reverse/cloze). context-supported исключаем.
  // Аннулированные review — НЕ свидетельство (системный инвариант, как channelStats/recentStruggleKeySet/
  // replay; критика diff wf_8cd4658d: иначе слово с ЕДИНСТВЕННЫМ аннулированным диктантом навсегда лишалось
  // бы flagship-gap). collectAnnulled по ТЕМ ЖЕ per-item строкам, что channelStats.
  async function hasDictateHistory(itemKey) {
    let rows = [];
    try { rows = await learnerLogRepo.itemRows(userId, itemKey); } catch (_) { rows = []; }
    const annulled = FC.collectAnnulled ? FC.collectAnnulled(rows) : {};
    return (rows || []).some((r) => r && r.kind === "review" && !annulled[String(r.id)] &&
      GP.channelPrefix(r.channel) === "dictate" && !GP.isContextSupportedRow(r));
  }

  // 1) FLAGSHIP — reading→dictation gap. Дёшево пре-фильтруем (readingStrong && !struggle), дорогой
  //    dictate-скан + itemRows ТОЛЬКО для выживших.
  if (base) {
    for (const it of items || []) {
      if (!readingStrong(it) || struggleSet.has(it.item_key)) continue;
      const d = await dictateEligible(it.item_key);
      if (!d) continue;
      if (await hasDictateHistory(it.item_key)) continue;   // уже диктовал → не «gap» (и не dictate-loop)
      return { ...d, select_reason: "reading_strong_close_dictation_gap" };
    }
  }

  // 2) cloze (мягчайший, context-cued; двойной consent внутри). struggle → cued-объяснение.
  //    Builder получает ТО ЖЕ due-окно (полный snapshot, §2-v2) и ТОТ ЖЕ exposure-снимок.
  const cz = await agentClozeRepo.selectClozeChallenge(userId, dueKeys, isExposed);
  if (cz && cz.item_key) {
    const reason = struggleSet.has(cz.item_key) ? "recent_struggle_prefer_cued" : "default_context";
    return { kind: "cloze", ...cz, select_reason: reason };
  }

  // 3) dictate baseline (любой готовый ассет; audio-cued средняя сложность — анти-старвация: due-слово,
  //    годное только для диктанта, не теряется = нет тихого 0).
  if (base) {
    for (const it of items || []) {
      const d = await dictateEligible(it.item_key);
      if (d) return { ...d, select_reason: "default_dictation" };
    }
    if (dNoAsset) console.log("[tg-review] dictate: " + dNoAsset + " due candidate(s) без ассета → run bake-dictate-audio");
  }

  // 4) reverse strictSafe (uncued — самая тяжёлая, последней)
  for (const it of items || []) {
    let g = null;
    try { g = await keyingService.glossForItemKey(it.item_key); } catch (_) { g = null; }
    if (!g || !g.strictSafe) continue;
    if (isExposed(it.item_key)) continue;
    return { kind: "reverse", item_key: it.item_key, gloss: g.gloss, expected: g.expected,
             sense_id: g.sense_id, select_reason: "default_recall" };
  }
  return null;
}

// ── §7 ReviewAllocationPolicy v1 ──────────────────────────────────────────────
const ALLOCATION_POLICY_VERSION = "reading-first-v1";
function almostLapsed(it) {
  return !!(it && (Number(it.lapses) > 0 || (it.stability != null && Number(it.stability) < 1)));
}

// ── challenge-scoped audio tokens (§9 п.15) ───────────────────────────────────
// computeDictateAssetKey — контент-производный ключ, инвертируемый против публичного датасета
// парадигм → до ответа клиенту НЕЛЬЗЯ отдавать ни assetKey, ни /api/audio/<key>-URL. Дескриптор
// несёт опак-токен; сервер мапит токен→assetKey и стримит байты challenge-скоуп-маршрутом.
// In-memory (один процесс, TTL=окно challenge): рестарт сервера жертвует только превью-ссылкой.
const AUDIO_TOKEN_TTL_MS = 10 * 60 * 1000;
const _audioTokens = new Map();   // token → { assetKey, exp }
function mintAudioToken(assetKey) {
  const crypto = require("crypto");
  for (const [t, v] of _audioTokens) if (v.exp <= Date.now()) _audioTokens.delete(t);   // прюн по ходу
  const token = crypto.randomBytes(18).toString("base64url");
  _audioTokens.set(token, { assetKey: String(assetKey), exp: Date.now() + AUDIO_TOKEN_TTL_MS });
  return token;
}
function resolveAudioToken(token) {
  const v = _audioTokens.get(String(token || ""));
  if (!v || v.exp <= Date.now()) return null;
  return v.assetKey;
}

// ── masked challenge descriptor (§6, leak-gate) ───────────────────────────────
// ЗАКРЫТАЯ форма: {kind, select_reason, explain, allocation, stimulus} — НИКОГДА item_key /
// expected / surface / written / vocalized / assetKey / anchor до ответа. cloze-предложение —
// blanked (ответ вырезан) — это само задание (P8-D4C: context-before только у cloze).
function buildDescriptor(pick, { lng, mode, preview } = {}) {
  const format = require(path.join(__dirname, "telegram", "format"));   // одна таблица объяснений с ботом
  const base = {
    kind: pick.kind,
    select_reason: String(pick.select_reason || ""),
    explain: format.selectExplanation(pick.select_reason, pick.kind, lng === "en" ? "en" : "ru"),
    allocation: { policy: ALLOCATION_POLICY_VERSION, mode: mode === "all_due" ? "all_due" : "reading_first" },
    ...(preview ? { preview: true } : {}),
  };
  if (pick.kind === "cloze") base.stimulus = { blanked_he: pick.blanked_he, sentence_ru: pick.sentence_ru || "" };
  else if (pick.kind === "dictate") base.stimulus = { audio_token: mintAudioToken(pick.assetKey) };
  else base.stimulus = { gloss: pick.gloss };
  return base;
}

// ── start (§3, §9 п.5): P8.3 = render-only preview при write-OFF ──────────────
// write-OFF (MINI_APP_REVIEW_WRITE≠1): дескриптор БЕЗ createChallenge и БЕЗ recordExposure —
// превью не лочит /review бота (challenge один на пользователя!) и не жжёт cooldown.
// write-ON (P8.4): создание challenge с surface + exposure (как бот-путь). Открытый challenge
// ДРУГОЙ поверхности → честный busy (бот-адаптер зеркально НЕ редоставляет miniapp-challenge).
function miniappWriteOn() { return process.env.MINI_APP_REVIEW_WRITE === "1"; }

async function start({ userId, surface, mode, lng, nowMs, tgUserId, tgChatId } = {}) {
  const now = Number(nowMs) || Date.now();
  if (surface !== "telegram_miniapp") return { ok: false, error: "BAD_SURFACE" };

  // открытый challenge? (single-use слот общий across surfaces — ux_agent_challenges_open)
  const open = await agentChallengeRepo.getOpenForUser(userId);
  if (open) {
    const openSurface = open.surface || "telegram_bot";
    if (openSurface !== surface) return { ok: true, busy_surface: openSurface };   // «заверши в боте»
    // resume своего surface: дескриптор из challenge-строки (cloze → двойной consent recheck, §9 п.16)
    if (open.prompt_kind === "cloze") {
      const learnerArtifactsRepo = require(path.join(__dirname, "..", "db", "learnerArtifactsRepo"));
      const agentSentenceRepo = require(path.join(__dirname, "..", "db", "agentSentenceRepo"));
      const okCloud = await learnerArtifactsRepo.hasConsent(userId);
      const okRead = await agentSentenceRepo.hasAgentReadConsent(userId);
      if (!okCloud || !okRead) { await agentChallengeRepo.cancelOpenForUser(userId); return { ok: true, none: "no-consent" }; }
    }
    return { ok: true, resumed: true, challenge_id: open.challenge_id, descriptor: _descriptorFromChallenge(open, lng) };
  }

  const pick = await selectEligible(userId, { nowMs: now, allocationMode: mode === "all_due" ? undefined : "reading_first" });
  if (!pick) return { ok: true, none: mode === "all_due" ? "nothing-eligible" : "nothing-in-reading-first-pool" };

  if (!miniappWriteOn()) {
    // P8.3 preview: рендер без состояния (no challenge row, no exposure)
    return { ok: true, descriptor: buildDescriptor(pick, { lng, mode, preview: true }) };
  }

  // P8.4-путь (dormant в P8.3): challenge с surface-провенансом; chat-ids из активной связки.
  const caps = _capsForSurface(pick, { userId, surface, tgUserId, tgChatId });
  const r = await agentChallengeRepo.createChallenge(caps);
  const chal = r.challenge;
  await agentChallengeRepo.recordExposure(userId, chal.item_key, "review_prompt");
  return { ok: true, created: r.created, challenge_id: chal.challenge_id, descriptor: _descriptorFromChallenge(chal, lng) };
}

// caps miniapp-challenge: канал = <modality>:ma (префикс=модальность → channel_stats/grade-policy
// сегментация цела; суффикс=surface-провенанс, §5). Поля 1:1 с бот-_capsFor.
function _capsForSurface(pick, { userId, surface, tgUserId, tgChatId }) {
  const crypto = require("crypto");
  const sha1 = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");
  const common = { userId, surface, tgUserId, tgChatId, item_key: pick.item_key,
    select_reason: pick.select_reason || null, accepted_alts: [] };
  if (pick.kind === "cloze") {
    const body = pick.blanked_he + (pick.sentence_ru ? "\n" + pick.sentence_ru : "");
    return { ...common, review_mode: "cloze:ma", prompt_kind: "cloze", evidence_scope: "cloze",
      expected_form_id: pick.item_key, expected_surface: pick.surface,
      anchor_text_key: pick.text_key, anchor_order_index: pick.order_index,
      shown_stimulus: body, stimulus_source: "synced-sentence", stimulus_source_version: null,
      stimulus_privacy_class: "C", stimulus_hash: sha1(body).slice(0, 16) };
  }
  if (pick.kind === "dictate") {
    return { ...common, review_mode: "dictate:ma", prompt_kind: "dictate", evidence_scope: "cell",
      expected_form_id: pick.item_key, sense_id: pick.sense_id, expected_surface: pick.written,
      shown_stimulus: pick.assetKey, stimulus_source: "dictate-tts", stimulus_source_version: "v12",
      stimulus_privacy_class: "A", stimulus_hash: sha1(pick.assetKey).slice(0, 16) };
  }
  return { ...common, review_mode: "reverse:ma", prompt_kind: "reverse", evidence_scope: "lexeme",
    expected_form_id: pick.item_key, sense_id: pick.sense_id, shown_stimulus: pick.gloss,
    stimulus_source: "pealim-infl", stimulus_source_version: "v12",
    stimulus_privacy_class: "A", stimulus_hash: sha1(pick.gloss).slice(0, 16) };
}

// дескриптор из challenge-СТРОКИ (resume/create-путь): та же закрытая форма, что buildDescriptor.
// cloze: shown_stimulus = "blanked\nru" (класс-C блок); dictate: shown_stimulus = assetKey → токен.
function _descriptorFromChallenge(chal, lng) {
  const format = require(path.join(__dirname, "telegram", "format"));
  const base = {
    kind: chal.prompt_kind,
    select_reason: String(chal.select_reason || ""),
    explain: format.selectExplanation(chal.select_reason, chal.prompt_kind, lng === "en" ? "en" : "ru"),
  };
  if (chal.prompt_kind === "cloze") {
    const s = String(chal.shown_stimulus || "");
    const nl = s.indexOf("\n");
    base.stimulus = { blanked_he: nl > 0 ? s.slice(0, nl) : s, sentence_ru: nl > 0 ? s.slice(nl + 1) : "" };
  } else if (chal.prompt_kind === "dictate") {
    base.stimulus = { audio_token: mintAudioToken(chal.shown_stimulus) };
  } else {
    base.stimulus = { gloss: String(chal.shown_stimulus || "") };
  }
  return base;
}

module.exports = {
  selectEligible, publicBaseUrl, audioUrlFor, start, buildDescriptor,
  mintAudioToken, resolveAudioToken, miniappWriteOn,
  REVIEW_DUE_WINDOW, ALLOCATION_POLICY_VERSION, almostLapsed,
};
