#!/usr/bin/env node
"use strict";
// smoke:agent-explain-corpus — гейт PAS-A1 (PAS_SLICE_A_SPEC v2 §A1): объяснение
// предложения ОБЩЕГО артефакта (корпус, public domain) без consent-класса B/C.
//   Фикстура = РЕАЛЬНАЯ форма works-файла ({library:{texts:[…]}}, sha256 text_key,
//     _reniqqud-ключ), id вне реального диапазона (90000077), dev-фолбэк ВЫКЛЮЧЕН
//     (критика wf_35f46603: рукописный мини-shape делал гейт тавтологией).
//   Teeth: corpus-объяснение работает при ПУСТЫХ consent · личный путь на том же
//     сервере по-прежнему 403 (гейты не смешаны) · смешанный body → 400 BAD_SOURCE_MIX ·
//     traversal-id/битый text_key → 400 · несуществующий work → 404 · ЧУЖОЙ text_key при
//     верном work_id → 404 (НЕТ фолбэка на texts[0] — многоглавные canon!) · второй текст
//     файла резолвится по СВОЕМУ text_key · order_index-промах → 404 · same-day dedupe
//     (повторный тап = from_history, usage НЕ вырос) · usage в ответе · история несёт
//     source='corpus' + sentence_he · revoke agent_read_texts: ЛИЧНАЯ строка tombstone,
//     КОРПУСНАЯ нетронута (R9: ложный purge_reason запрещён) · kill-switch → честный
//     фолбэк (перевод+морфология, llm_used=false).
// Run: node scripts/premium/agent-explain-corpus-smoke.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3323, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-corpus-explain-secret-0123456789";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WORK_ID = "90000077";                       // вне реального диапазона git-копии
const KEY_A = "a".repeat(64), KEY_B = "b".repeat(64), KEY_MISS = "c".repeat(64);
const SENT_A = "הילד קורא ספר גדול";
const RU_A = "КОРПУСПЕРЕВОД мальчик читает большую книгу";
const SENT_B = "האישה כותבת מכתב";
const OWN_KEY = "own-corpus-smoke-1";

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function worksFixture() {
  // РЕАЛЬНАЯ форма (по образцу public/data/benyehuda/works/10.json): library-обёртка,
  // sha256-подобные text_key, source_meta.corpus, _reniqqud.
  return {
    library: {
      schema_version: 1,
      texts: [
        {
          text_id: "by-" + WORK_ID, text_key: KEY_A, title: "עבודה בדיונית",
          source_meta: { origin: "benyehuda-ingest", corpus: { schema: 1, byehuda_id: WORK_ID, author: "אחד העם", era: "tehiya", provenance: { source: "Project Ben-Yehuda", license: "public-domain" } } },
          rows: [
            { row_id: "r0", order_index: 0, hebrew_plain: SENT_A, hebrew_niqqud: "", translit: "", russian: RU_A },
            { row_id: "r1", order_index: 1, hebrew_plain: "משפט שני", hebrew_niqqud: "", translit: "", russian: "второе предложение" },
          ],
        },
        {
          text_id: "by-" + WORK_ID + "-2", text_key: KEY_B, title: "פרק שני",
          source_meta: { origin: "benyehuda-ingest", corpus: { schema: 1, byehuda_id: WORK_ID } },
          rows: [{ row_id: "r0", order_index: 0, hebrew_plain: SENT_B, hebrew_niqqud: "", translit: "", russian: "женщина пишет письмо" }],
        },
      ],
    },
    _reniqqud: { pass: 1 },
  };
}

function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "10", AGENT_LLM_DAILY_GLOBAL: "100",
      CORPUS_WORKS_DEV_FALLBACK: "",   // hermetic: git-копия works НЕ видна гейту
      AGENT_LLM_DISABLED: "",
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
  return { status: res.status, json };
}
async function login() {
  const h = { "Content-Type": "application/json" };
  const res = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: h, body: JSON.stringify({ secret: SECRET, deviceLabel: "corpus-smoke" }) });
  const json = await res.json();
  eq(res.status === 200 && json.ok, "login failed");
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  return { cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: json.csrf };
}
const corpusBody = (over) => ({ scope_level: "sentence_only", source: "corpus", work_id: WORK_ID, text_key: KEY_A, order_index: 0, ...(over || {}) });

(async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-corpus-explain-"));
  const worksDir = path.join(scratch, "benyehuda", "works");
  fs.mkdirSync(worksDir, { recursive: true });
  fs.writeFileSync(path.join(worksDir, WORK_ID + ".json"), JSON.stringify(worksFixture()));

  let srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan :" + PORT + ")\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();

    // ── happy-path на ПУСТЫХ consent-строках (общий артефакт) ────────────────────
    const ex1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody() });
    eq(ex1.status === 200 && ex1.json.ok === true, "corpus explain must be 200 without ANY consent, got " + ex1.status + "/" + JSON.stringify(ex1.json && ex1.json.error));
    eq(ex1.json.source === "corpus", "response must carry source='corpus'");
    eq(!!ex1.json.text, "explanation text must be non-empty");
    eq(ex1.json.llm_used === true, "mock provider must be used (llm_used=true)");
    eq(ex1.json.work && ex1.json.work.license === "public-domain" && ex1.json.work.author === "אחד העם", "work meta must carry license+author");
    eq(ex1.json.anchor && ex1.json.anchor.work_id === WORK_ID && ex1.json.anchor.text_key === KEY_A && ex1.json.anchor.order_index === 0, "anchor must be corpus-shaped");
    eq(ex1.json.usage && ex1.json.usage.user_llm_calls >= 1 && ex1.json.usage.limit === 10, "usage must be visible at the point of spend");
    eq(ex1.json.sentence && ex1.json.sentence.he === SENT_A, "sentence must be the anchored corpus row");

    // ── личный путь НЕ разблокирован корпусным (гейты не смешаны) ────────────────
    const own1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { scope_level: "sentence_only", text_key: OWN_KEY, order_index: 0 } });
    eq(own1.status === 403 && own1.json.error === "CLOUD_TEXTS_CONSENT_REQUIRED", "personal path must still be 403 CLOUD_TEXTS_CONSENT_REQUIRED, got " + own1.status + "/" + (own1.json && own1.json.error));

    // ── контракт-реджекты ────────────────────────────────────────────────────────
    const mix = await api("POST", "/api/agent/explain", { cookie, csrf, body: { scope_level: "sentence_only", text_key: OWN_KEY, order_index: 0, work_id: WORK_ID } });
    eq(mix.status === 400 && mix.json.error === "BAD_SOURCE_MIX", "mixed body (personal + work_id) must be 400 BAD_SOURCE_MIX");
    const trav = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody({ work_id: "../../etc/passwd" }) });
    eq(trav.status === 400 && trav.json.error === "BAD_WORK_ID", "traversal work_id must be 400 BAD_WORK_ID");
    const badKey = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody({ text_key: "not-hex!" }) });
    eq(badKey.status === 400 && badKey.json.error === "BAD_TEXT_KEY", "malformed text_key must be 400 BAD_TEXT_KEY");
    const noWork = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody({ work_id: "90000078" }) });
    eq(noWork.status === 404 && noWork.json.error === "CORPUS_WORK_NOT_FOUND", "unknown work must be 404 CORPUS_WORK_NOT_FOUND (dev-fallback OFF)");
    const wrongKey = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody({ text_key: KEY_MISS }) });
    eq(wrongKey.status === 404 && wrongKey.json.error === "CORPUS_SENTENCE_NOT_FOUND", "foreign text_key must be 404 (NO texts[0] fallback — multi-chapter teeth)");
    const oiMiss = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody({ order_index: 99 }) });
    eq(oiMiss.status === 404 && oiMiss.json.error === "CORPUS_SENTENCE_NOT_FOUND", "order_index miss must be 404");

    // ── второй текст файла резолвится по СВОЕМУ text_key (многоглавная работа) ──
    const exB = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody({ text_key: KEY_B }) });
    eq(exB.status === 200 && exB.json.sentence && exB.json.sentence.he === SENT_B, "second chapter must resolve by ITS text_key");

    // ── same-day dedupe: повтор того же якоря = from_history, usage НЕ вырос ─────
    const usageBefore = exB.json.usage.user_llm_calls;
    const ex1b = await api("POST", "/api/agent/explain", { cookie, csrf, body: corpusBody() });
    eq(ex1b.status === 200 && ex1b.json.from_history === true, "same-day re-tap must serve from history");
    eq(ex1b.json.usage && ex1b.json.usage.user_llm_calls === usageBefore, "dedupe must NOT burn a new reserve (usage unchanged)");
    eq(ex1b.json.text === ex1.json.text, "history reply must carry the same text");

    // ── история: source='corpus' + sentence_he ──────────────────────────────────
    const hist = await api("GET", "/api/agent/explanations?limit=10", { cookie });
    eq(hist.status === 200 && hist.json.ok !== false, "history must be readable");
    const items = (hist.json.explanations || []);
    const corpusItems = items.filter((i) => i.source === "corpus");
    eq(corpusItems.length >= 2, "history must carry corpus items with source='corpus', got " + corpusItems.length);
    eq(corpusItems.every((i) => !!i.sentence_he), "corpus history items must carry sentence_he (corpus_sentence fact)");

    // ── revoke agent_read_texts: личная строка tombstone, корпусная нетронута ────
    for (const k of ["cloud_texts", "agent_read_texts"]) {
      const c = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: k, granted: true, version: k === "cloud_texts" ? require("../../public/js/cloud-sync.js").CLOUD_TEXTS_CONSENT_VERSION : "v1" } });
      eq(c.status === 200, k + " grant failed");
    }
    const put = await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: {
      artifact_key: OWN_KEY, updated_at: "2026-07-01T00:00:00.000Z",
      payload: { manifest: { export_schema_version: 1 }, texts: [{ text_key: OWN_KEY, title: "own", rows: [
        { order_index: 0, hebrew_plain: "אני קורא עכשיו", hebrew_niqqud: "", translit: "", russian: "ЛИЧНЫЙПЕРЕВОД я читаю сейчас" },
      ] }] },
    } });
    eq(put.status === 200, "personal artifact put failed: " + JSON.stringify(put.json));
    const ownEx = await api("POST", "/api/agent/explain", { cookie, csrf, body: { scope_level: "sentence_only", text_key: OWN_KEY, order_index: 0 } });
    eq(ownEx.status === 200 && ownEx.json.ok === true && ownEx.json.source === "personal", "personal explain (with consents) must work");
    const rev = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: false, version: "v1" } });
    eq(rev.status === 200, "revoke failed");
    const hist2 = await api("GET", "/api/agent/explanations?limit=20", { cookie });
    const items2 = hist2.json.explanations || [];
    const ownAfter = items2.find((i) => i.sentence_id === OWN_KEY + "#0");
    const corpAfter = items2.find((i) => i.sentence_id === KEY_A + "#0");
    eq(!!ownAfter && ownAfter.purged === true && !ownAfter.text, "personal explanation must be tombstoned after revoke");
    eq(!!corpAfter && corpAfter.purged !== true && !!corpAfter.text, "corpus explanation must SURVIVE revoke (public domain — R9 false purge_reason forbidden)");

    await stop(srv.c); srv = null;

    // ── kill-switch: честный фолбэк без LLM ──────────────────────────────────────
    srv = startServer(scratch, { AGENT_LLM_DISABLED: "1" });
    if (!(await ready(srv))) { console.error("kill-switch boot failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const s2 = await login();
    const exK = await api("POST", "/api/agent/explain", { cookie: s2.cookie, csrf: s2.csrf, body: corpusBody({ order_index: 1 }) });
    eq(exK.status === 200 && exK.json.ok === true && exK.json.llm_used === false && exK.json.degraded_reason === "KILL_SWITCH",
      "kill-switch corpus explain must degrade honestly, got " + JSON.stringify(exK.json && { ok: exK.json.ok, llm: exK.json.llm_used, d: exK.json.degraded_reason }));
    eq(String(exK.json.text || "").includes("второе предложение"), "fallback must carry the corpus translation");
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    if (srv) await stop(srv.c).catch(() => {});
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const total = 27;
  if (failures.length) {
    console.error(`smoke:agent-explain-corpus FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`smoke:agent-explain-corpus OK (${total}/${total}) — PAS-A1: корпус без consent · личный путь не смешан · BAD_SOURCE_MIX/traversal/badkey · 404-семейство · НЕТ texts[0]-фолбэка (многоглавные) · dedupe без reserve · usage в ответе · история source=corpus · revoke щадит корпус · kill-switch фолбэк`);
  process.exit(0);
})();
