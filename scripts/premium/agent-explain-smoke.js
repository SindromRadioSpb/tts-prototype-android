#!/usr/bin/env node
"use strict";
// smoke:agent-explain — гейт CLG-P6 слайса 2 (/explain sentence; решение владельца
// 2026-07-06: consent = отдельный durable agent_read_texts, scope = sentence_only).
//   Consent-гейты: 401 без сессии · 403 без CSRF · 403 CLOUD_TEXTS_CONSENT_REQUIRED ·
//     403 AGENT_READ_TEXTS_CONSENT_REQUIRED · 200 при обоих · revoke → 403 снова;
//   Scope-гейты: scope_level отсутствует/neighbors/paragraph → 400 UNSUPPORTED_EXPLAIN_SCOPE;
//     соседние предложения НЕ попадают ни в ответ, ни в facts_used, ни в stdout;
//   Provenance-гейты (§7/R9): строка agent_explanations создана; facts_used несёт
//     anchor + scope_level=sentence_only + morphology source=resolver/asserted +
//     learner_state; провайдер/модель в body; export-sweep включает agent_explanations;
//   Privacy/log-гейты (класс D): текст предложения и перевод НЕ появляются в stdout
//     сервера; 404 на неизвестный text_key/order_index;
//   MNAR: /explain НЕ пишет в review_log;
//   Learner-интеграция: due-слово ИЗ предложения попадает в learner.due_in_sentence
//     (тот же keyingService, что /keying/resolve — R1 резолвер утверждает);
//   Revoke-гейты: purge контентных полей (facts_used='[]', tombstone c purge_reason),
//     старый контент отсутствует в export после revoke;
//   Kill-switch (бут №2): честная деградация — перевод+морфология без LLM, бюджет не жжётся.
// Run: node scripts/premium/agent-explain-smoke.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3301, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-explain-secret-0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sentinel-контент: якорное предложение + сосед-до/сосед-после с уникальными маркерами.
// Реальные ивритские слова — резолвер обязан ключевать хотя бы одно (датасет в репо).
const SENT_HE = "הילד קורא ספר גדול";
const SENT_RU = "СЕНТИНЕЛПЕРЕВОД мальчик читает большую книгу";
const NEIGHBOR_BEFORE = "קודםקודםקודם משפט שכן";
const NEIGHBOR_AFTER = "אחראחראחר משפט שכן";
const TEXT_KEY = "own-exp-1";

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "10", AGENT_LLM_DAILY_GLOBAL: "100",
      ...(extraEnv || {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(srv, ms = 30000) {
  const s = Date.now();
  while (Date.now() - s < ms) {
    if (srv.logs.some((l) => l.includes("EADDRINUSE"))) return false;
    try {
      const r = await fetch(BASE + "/healthz");
      if (r.status === 200) { const j = await r.json(); if (j.db && j.db.ready && j.migrations && j.migrations.ready) return true; }
    } catch (_) {}
    await sleep(200);
  }
  return false;
}
async function api(method, p, { cookie, csrf, body } = {}) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json, res };
}
async function login() {
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "explain-smoke" } });
  eq(li.status === 200 && li.json.ok, "login failed");
  const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  return { cookie: String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: li.json.csrf };
}

// Канонический exportBundle-shape (то, что реально кладёт cloud-sync): texts[].rows[].
function bundleFixture() {
  return {
    manifest: { export_schema_version: 1, app_id: "linguist-pro-web" },
    texts: [{
      text_key: TEXT_KEY, title: "Smoke explain text",
      rows: [
        { order_index: 0, hebrew_plain: NEIGHBOR_BEFORE, hebrew_niqqud: "", translit: "", russian: "сосед до" },
        { order_index: 1, hebrew_plain: SENT_HE, hebrew_niqqud: "", translit: "", russian: SENT_RU },
        { order_index: 2, hebrew_plain: NEIGHBOR_AFTER, hebrew_niqqud: "", translit: "", russian: "сосед после" },
      ],
      created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z",
    }],
  };
}

(async () => {
  // ── pure: инструмент теперь ВКЛЮЧЁН (снят OPAQUE_ARTIFACT_STORE) ─────────────
  const tools = require(path.join(REPO, "agent", "tools.js"));
  const sctxTool = tools.listTools().find((t) => t.name === "get_sentence_context_if_available");
  eq(!!sctxTool && sctxTool.enabled === true,
    "get_sentence_context_if_available must be ENABLED after the owner's privacy decision");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-explain-smoke-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan :" + PORT + ")\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    // ── auth-гейты ────────────────────────────────────────────────────────────
    const un = await api("POST", "/api/agent/explain", { body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(un.status === 401, "explain unauth must be 401, got " + un.status);
    const { cookie, csrf } = await login();
    const noCsrf = await api("POST", "/api/agent/explain", { cookie, body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(noCsrf.status === 403, "explain without CSRF must be 403, got " + noCsrf.status);

    // ── scope-контракт: ТОЛЬКО явный sentence_only ────────────────────────────
    for (const bad of [undefined, "sentence_plus_neighbors", "paragraph"]) {
      const r = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 1, ...(bad ? { scope_level: bad } : {}) } });
      eq(r.status === 400 && r.json.error === "UNSUPPORTED_EXPLAIN_SCOPE",
        "scope_level=" + bad + " must be 400 UNSUPPORTED_EXPLAIN_SCOPE, got " + r.status + "/" + (r.json && r.json.error));
    }
    const badAnchor = await api("POST", "/api/agent/explain", { cookie, csrf, body: { scope_level: "sentence_only", order_index: 1 } });
    eq(badAnchor.status === 400 && badAnchor.json.error === "BAD_ANCHOR", "missing text_key must be 400 BAD_ANCHOR");

    // ── consent-лестница: без cloud_texts → 403 (точный код) ──────────────────
    const noC1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(noC1.status === 403 && noC1.json.error === "CLOUD_TEXTS_CONSENT_REQUIRED",
      "no cloud_texts consent must be 403 CLOUD_TEXTS_CONSENT_REQUIRED, got " + noC1.status + "/" + (noC1.json && noC1.json.error));

    // cloud_texts ON + артефакт на сервере; agent_read_texts всё ещё OFF → 403 (свой код)
    const c1 = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "cloud_texts", granted: true, version: "v1" } });
    eq(c1.status === 200 && c1.json.ok, "cloud_texts grant failed");
    const put = await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: {
      artifact_key: TEXT_KEY, updated_at: "2026-07-01T00:00:00.000Z", payload: bundleFixture(),
    } });
    eq(put.status === 200 && put.json.stored === true, "artifact put failed: " + JSON.stringify(put.json));
    const noC2 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(noC2.status === 403 && noC2.json.error === "AGENT_READ_TEXTS_CONSENT_REQUIRED",
      "no agent_read_texts consent must be 403 AGENT_READ_TEXTS_CONSENT_REQUIRED, got " + noC2.status + "/" + (noC2.json && noC2.json.error));

    // ── оба согласия; due-слово ИЗ предложения через штатный keying+ingest ────
    const c2 = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: true, version: "v1" } });
    eq(c2.status === 200 && c2.json.ok, "agent_read_texts grant failed");
    const keyed = await api("POST", "/api/learner/keying/resolve", { cookie, csrf, body: {
      words: SENT_HE.split(" ").map((s) => ({ surface: s })),
    } });
    const keyable = ((keyed.json && keyed.json.results) || []).filter((r) => r.keyable && r.item_key);
    eq(keyable.length >= 1, "resolver must key at least one word of the fixture sentence");
    const dueKey = keyable[0] ? keyable[0].item_key : "unkeyable";
    const ing = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "explain-smoke-seed", schema_version: 1, keyer_version: 1,
      review_log: [{ id: "exp-smoke:due:1", item_key: dueKey, kind: "review",
        reviewed_at: "2026-06-20T08:00:00.000Z", grade: 1, source: "room-recall", channel: "read:mc",
        meta_json: JSON.stringify({ keyer_version: 1 }) }],
    } });
    eq(ing.status === 200 && ing.json.review_log && ing.json.review_log.rejected === 0, "seed ingest must be clean");

    const logBefore = await api("GET", "/api/learner/counts", { cookie });

    // ── /explain №1: mock-LLM, полный контракт ответа ─────────────────────────
    const e1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(e1.status === 200 && e1.json.ok, "explain #1 failed: " + JSON.stringify(e1.json && e1.json.error));
    eq(e1.json.scope_level === "sentence_only" && e1.json.category === "объяснить",
      "explain must carry scope_level=sentence_only + R17 category 'объяснить'");
    eq(e1.json.anchor && e1.json.anchor.text_key === TEXT_KEY && e1.json.anchor.order_index === 1, "anchor must round-trip");
    eq(e1.json.sentence && e1.json.sentence.he === SENT_HE && e1.json.sentence.ru === SENT_RU, "sentence must be the anchored row");
    eq(e1.json.llm_used === true && e1.json.provider === "mock", "explain #1 must use the mock LLM");
    eq(Array.isArray(e1.json.morphology) && e1.json.morphology.length >= 1, "morphology (resolver-asserted) must be present");
    eq((e1.json.learner && e1.json.learner.due_in_sentence || []).includes(dueKey),
      "due word FROM this sentence must appear in learner.due_in_sentence (same keyingService both paths)");
    eq(!!e1.json.explanation_id, "explanation row must be created");
    const respStr = JSON.stringify(e1.json);
    eq(!respStr.includes("קודםקודםקודם") && !respStr.includes("אחראחראחר"),
      "scope sentence_only: neighbor sentences must NOT leak into the response");

    // MNAR: объяснение — не учебное событие.
    const logAfter = await api("GET", "/api/learner/counts", { cookie });
    eq(JSON.stringify(logBefore.json) === JSON.stringify(logAfter.json),
      "MNAR: /explain must write NOTHING to review_log");

    // ── provenance в agent_explanations (через export — заодно sweep-гейт §10) ─
    const exp1 = await api("GET", "/api/account/export", { cookie });
    const expTables = exp1.json && exp1.json.tables ? exp1.json.tables : exp1.json || {};
    const expStr1 = JSON.stringify(exp1.json || {});
    eq(exp1.status === 200 && expStr1.includes("agent_explanations"), "export must include agent_explanations (dynamic sweep)");
    const explRows = (expTables.agent_explanations || (exp1.json && exp1.json.data && exp1.json.data.agent_explanations) || []);
    const row = (Array.isArray(explRows) ? explRows : []).find((r) => String(r.sentence_id || "") === TEXT_KEY + "#1");
    eq(!!row, "agent_explanations row with anchor sentence_id must exist in export");
    let facts = []; let bodyJ = {};
    try { facts = JSON.parse(row.facts_used_json); bodyJ = JSON.parse(row.body_json); } catch (_) {}
    const fSent = facts.find((f) => f.kind === "user_sentence");
    const fMorph = facts.find((f) => f.kind === "morphology");
    const fLearn = facts.find((f) => f.kind === "learner_state");
    eq(!!fSent && fSent.source === "consented_artifact" && fSent.scope_level === "sentence_only"
      && fSent.anchor && fSent.anchor.text_key === TEXT_KEY && fSent.text === SENT_HE,
      "facts_used: user_sentence fact must carry source/scope_level/anchor/text");
    eq(!!fMorph && fMorph.source === "resolver" && fMorph.provenance === "asserted" && (fMorph.items || []).length >= 1,
      "facts_used: morphology must be resolver/asserted (R1/R9)");
    eq(!!fLearn && (fLearn.due_in_sentence || []).includes(dueKey), "facts_used: learner_state must record due_in_sentence");
    eq(bodyJ.scope_level === "sentence_only" && bodyJ.provider === "mock" && bodyJ.llm_used === true,
      "body: scope_level + provider/model + llm_used must be recorded");
    eq(!JSON.stringify(facts).includes("קודםקודםקודם") && !JSON.stringify(facts).includes("אחראחראחר"),
      "facts_used must NOT contain neighbor sentences");

    // ── 404-гейты ─────────────────────────────────────────────────────────────
    const nf1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: "no-such-text", order_index: 0, scope_level: "sentence_only" } });
    eq(nf1.status === 404 && nf1.json.error === "TEXT_NOT_IN_CLOUD", "unknown text_key must be 404 TEXT_NOT_IN_CLOUD");
    const nf2 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 999, scope_level: "sentence_only" } });
    eq(nf2.status === 404 && nf2.json.error === "SENTENCE_NOT_FOUND", "unknown order_index must be 404 SENTENCE_NOT_FOUND");

    // ── revoke → fail-closed + purge контентных полей ─────────────────────────
    const rv = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: false, version: "v1" } });
    eq(rv.status === 200 && rv.json.ok && rv.json.explanations && rv.json.explanations.purged >= 1,
      "revoke must report purged explanations, got " + JSON.stringify(rv.json && rv.json.explanations));
    const afterRv = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(afterRv.status === 403 && afterRv.json.error === "AGENT_READ_TEXTS_CONSENT_REQUIRED", "explain after revoke must be 403 again");
    const exp2 = await api("GET", "/api/account/export", { cookie });
    const expTables2 = exp2.json && exp2.json.tables ? exp2.json.tables : exp2.json || {};
    const explRows2 = (expTables2.agent_explanations || (exp2.json && exp2.json.data && exp2.json.data.agent_explanations) || []);
    const row2 = (Array.isArray(explRows2) ? explRows2 : []).find((r) => String(r.sentence_id || "") === TEXT_KEY + "#1");
    let body2 = {};
    try { body2 = JSON.parse(row2.body_json); } catch (_) {}
    eq(!!row2 && row2.facts_used_json === "[]" && body2.purge_reason === "consent_revoked" && !!body2.purged_at,
      "purge must tombstone content fields (facts_used='[]', purge_reason, purged_at)");
    const rowStr2 = JSON.stringify(row2 || {});
    eq(!rowStr2.includes(SENT_HE) && !rowStr2.includes("СЕНТИНЕЛПЕРЕВОД"),
      "purged explanation must NOT contain the sentence or translation");

    // ── stdout-гигиена (класс D): контент не печатается сервером ──────────────
    const all = srv.logs.join("");
    eq(!all.includes(SENT_HE.split(" ")[1]) && !all.includes("СЕНТИНЕЛПЕРЕВОД")
      && !all.includes("קודםקודםקודם") && !all.includes("אחראחראחר"),
      "class D hygiene: sentence/translation/neighbors must NOT appear in server stdout/stderr");
  } catch (e) {
    failures.push("CRASH boot1: " + ((e && e.stack) || e));
  } finally {
    await stop(srv.c);
  }

  // ── бут №2: kill-switch → детерминированное объяснение, бюджет цел ──────────
  const srv2 = startServer(scratch, { AGENT_LLM_DISABLED: "1" });
  try {
    if (!(await ready(srv2))) { console.error("server #2 failed\n" + srv2.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    // agent_read_texts был отозван в буте №1 → вернуть для честного kill-switch-теста
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: true, version: "v1" } });
    const stBefore = await api("GET", "/api/agent/status", { cookie });
    const usedBefore = (stBefore.json && stBefore.json.usage && stBefore.json.usage.user_llm_calls) || 0;
    const ek = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(ek.status === 200 && ek.json.ok && ek.json.llm_used === false && ek.json.degraded_reason === "KILL_SWITCH",
      "kill-switch: explain must degrade honestly, got " + JSON.stringify(ek.json && { u: ek.json.llm_used, d: ek.json.degraded_reason }));
    eq(!!ek.json.text && ek.json.text.includes(SENT_RU),
      "kill-switch: degraded explanation must STILL be useful (translation present) — R16 LLM-less");
    const st = await api("GET", "/api/agent/status", { cookie });
    eq(st.json && st.json.usage && st.json.usage.user_llm_calls === usedBefore,
      "kill-switch is checked BEFORE reserve: ledger must NOT grow (ledger персистентен между бутами, сравнение до/после), got "
      + usedBefore + " → " + JSON.stringify(st.json && st.json.usage));
  } catch (e) {
    failures.push("CRASH boot2: " + ((e && e.stack) || e));
  } finally {
    await stop(srv2.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const TOTAL = 33;
  if (failures.length) {
    console.error(`smoke:agent-explain FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:agent-explain OK (${TOTAL}/${TOTAL}) — CLG-P6 слайс 2: двойной consent fail-closed (cloud_texts + agent_read_texts, точные 403-коды) · scope-контракт sentence_only (соседи не в ответе/facts_used/stdout) · facts_used-провенанс (anchor · resolver/asserted · learner_state) · MNAR · 404-якоря · revoke→purge tombstone · export-sweep · kill-switch LLM-less + нулевой ledger-burn · stdout-гигиена класса D`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
