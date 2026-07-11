"use strict";

// agent/runtime.js — CLG-P6 фасад agent runtime для server.js (§9 «принятый план»).
// Слайс 1: сценарий /plan (read-only) + status. Роли planner/tutor/reviewer/explainer/
// recommender/grader материализуются посценарно (tutor/explainer — слайс /explain;
// reviewer/grader — после гейтов 4.8); фасад намеренно узкий — сервер видит сценарии,
// не внутренности. Прямого SQLite здесь нет (только через db/agentRepo и tools).

const path = require("path");
const planner = require(path.join(__dirname, "planner"));
const explainer = require(path.join(__dirname, "explainer"));
const tools = require(path.join(__dirname, "tools"));
const llm = require(path.join(__dirname, "llm"));
const constructs = require(path.join(__dirname, "constructs"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));

async function plan(ctx) {
  return planner.plan(ctx);
}

// Слайс 2: /explain sentence (двойной consent + scope sentence_only внутри explainer/repo).
async function explain(ctx, args) {
  return explainer.explain(ctx, args || {});
}

// P7.0c: запись ответа/annul — СТРОГО через closed tool router (единственные ворота
// записи; флаг/whitelist/B2 живут там и в reviewer). Контрактные реджекты reviewer
// ВОЗВРАЩАЕТ (не бросает), callTool оборачивает их в {ok:true, result:{ok:false…}} —
// анврапим, чтобы endpoint видел коды as-is; router-ошибки (TOOL_DISABLED/
// USER_ID_IN_ARGS/TOOL_FAILED) пробрасываются как есть.
async function recordReview(ctx, args) {
  const call = await tools.callTool(ctx, "record_review_answer", args || {});
  if (!call.ok) return call;
  return call.result;
}

async function status(ctx) {
  const usage = await agentRepo.usageToday(ctx.userId);
  const profile = await agentRepo.getProfile(ctx.userId);
  return {
    provider: llm.providerName(),
    key_source: llm.keySource(),   // agent | none (R16: агент платит ТОЛЬКО своим ключом)
    kill_switch: llm.killSwitchOn(),
    limits: {
      llm_daily_per_user: Number(process.env.AGENT_LLM_DAILY_PER_USER) || 50,
      llm_daily_global: Number(process.env.AGENT_LLM_DAILY_GLOBAL) || 200,
    },
    usage,
    profile: { mode: profile.mode, language: profile.language },
    tools: tools.listTools(),
  };
}

async function listTasks(ctx, opts) {
  return agentRepo.listTasks(ctx.userId, opts || {});
}

// P9 «дом наставника» — история объяснений (read-only, MNAR-чист: ничего не пишет).
// Purge-aware (R11): tombstone-строка после отзыва agent_read_texts отдаётся ЧЕСТНО
// как purged (дата/якорь остаются — идентификаторы класса A), контент — никогда.
// В ленту НЕ отдаётся facts_used целиком (внутренний провенанс) — только якорное
// предложение из факта user_sentence (собственный текст пользователя, та же
// privacy-плоскость, что ответ /explain тому же принципалу).
function _explanationListItem(row) {
  let body = {}, facts = [];
  try { body = JSON.parse(row.body_json) || {}; } catch (_) {}
  try { facts = JSON.parse(row.facts_used_json) || []; } catch (_) {}
  const purged = !!body.purge_reason;
  // якорь: sentence_id = '<text_key>#<order_index>' (order_index — после ПОСЛЕДНЕГО '#';
  // text_key может теоретически содержать '#', обратное — нет: order_index числовой)
  let anchor = null;
  const sid = row.sentence_id != null ? String(row.sentence_id) : "";
  const hi = sid.lastIndexOf("#");
  if (hi > 0) {
    const oi = Number(sid.slice(hi + 1));
    if (Number.isFinite(oi)) anchor = { text_key: sid.slice(0, hi), order_index: oi };
  }
  // PAS-A1: corpus_sentence — общий артефакт, та же privacy-плоскость (public domain);
  // source различает копию клиента (тост «откройте работу в Корпусе», не «синхронизируйте»).
  const fSent = purged ? null : (Array.isArray(facts) ? facts.find((f) => f && (f.kind === "user_sentence" || f.kind === "corpus_sentence")) : null);
  return {
    id: row.id, rid: row.rid, created_at: row.created_at, sentence_id: row.sentence_id,
    anchor,
    ...(fSent && fSent.kind === "corpus_sentence" ? { source: "corpus" } : {}),
    purged,
    ...(purged ? { purge_reason: body.purge_reason, purged_at: body.purged_at || null } : {}),
    text: purged ? null : (body.text != null ? String(body.text) : null),
    sentence_he: fSent && fSent.text != null ? String(fSent.text) : null,
    language: body.language || null,
    llm_used: !purged && body.llm_used === true,
    ...(body.provider ? { provider: body.provider, model: body.model || null } : {}),
    ...(body.degraded_reason ? { degraded_reason: body.degraded_reason } : {}),
    scope_level: body.scope_level || null,
  };
}

async function listExplanations(ctx, { limit, beforeRid } = {}) {
  const { rows, has_more } = await agentRepo.listExplanations(ctx.userId, { limit, beforeRid });
  const items = rows.map(_explanationListItem);
  return {
    explanations: items,
    has_more,
    next_before_rid: has_more && items.length ? items[items.length - 1].rid : null,
  };
}

// P9 зачаток misconception-блока: агрегат construct_id из facts_used объяснений
// (purge-aware по построению) + plan-task payload. Наружу уходят ТОЛЬКО известные
// реестру ids (⊆ registry — структурная гарантия, тот же filterKnown-инвариант P6.4)
// с серверными титулами; клиент реестр не дублирует.
async function constructsSummary(ctx) {
  const occ = await agentRepo.constructOccurrences(ctx.userId, {});
  const agg = new Map();   // id → { count, last_seen_at, from_explanations, from_plans }
  for (const o of occ) {
    if (!constructs.isKnown(o.id)) continue;
    let a = agg.get(o.id);
    if (!a) { a = { count: 0, last_seen_at: null, from_explanations: 0, from_plans: 0 }; agg.set(o.id, a); }
    a.count++;
    if (o.source === "explanation") a.from_explanations++; else a.from_plans++;
    if (!a.last_seen_at || String(o.at) > String(a.last_seen_at)) a.last_seen_at = o.at;
  }
  const out = [...agg.entries()].map(([id, a]) => ({
    id, kind: constructs.get(id).kind,
    title_ru: constructs.title(id, "ru"), title_en: constructs.title(id, "en"),
    count: a.count, from_explanations: a.from_explanations, from_plans: a.from_plans,
    last_seen_at: a.last_seen_at,
  }));
  out.sort((x, y) => y.count - x.count || String(y.last_seen_at).localeCompare(String(x.last_seen_at)));
  return { constructs: out };
}

async function updateProfile(ctx, patch) {
  const p = await agentRepo.updateProfile(ctx.userId, patch || {});
  return { mode: p.mode, language: p.language };
}

module.exports = { plan, explain, recordReview, status, listTasks, updateProfile, listExplanations, constructsSummary };
