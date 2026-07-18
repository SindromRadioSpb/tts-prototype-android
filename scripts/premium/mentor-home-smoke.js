#!/usr/bin/env node
"use strict";
// smoke:mentor-home — гейт P9 «дом наставника», серверный слайс
// (MENTOR_HOME_P9_DECISION_2026_07_06 §5 «Гейты приёмки»):
//   1) 401-gating обоих новых endpoint'ов (GET /api/agent/explanations,
//      GET /api/agent/constructs/summary);
//   2) история объяснений: контент/якорь/провенанс LLM в list-ответе; порядок
//      newest-first; limit + before_rid-курсор (has_more честный);
//   3) СТРОГО user-scoped: второй пользователь (создан напрямую в scratch-БД —
//      паттерн B1 learner-ingest, бэкдоров в прод-коде нет) видит ПУСТУЮ ленту
//      и пустой агрегат, чужие строки не отдаются;
//   4) constructs/summary ⊆ реестра: все ids известны agent/constructs.js, титулы
//      ru/en серверные; агрегат считает ОБА источника (facts_used объяснения +
//      construct_ids plan-task секции);
//   5) MNAR: просмотр дома (оба GET) ничего не пишет в review_log;
//   6) purge-aware: отзыв agent_read_texts → лента отдаёт tombstone (purged +
//      причина, БЕЗ текста предложения/объяснения), constructs/summary теряет
//      explanation-вхождения (facts_used='[]' по построению), plan-вхождения
//      (класс A) переживают;
//   7) stdout-гигиена: контент предложения не печатается сервером (класс D).
// Run: node scripts/premium/mentor-home-smoke.js [--gate]

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3307, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-mentor-secret-0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SENT_HE = "הילד קורא ספר גדול";
const SENT_RU = "МЕНТОРСЕНТИНЕЛ мальчик читает большую книгу";
const TEXT_KEY = "own-mentor-1";

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "20", AGENT_LLM_DAILY_GLOBAL: "100",
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
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "mentor-smoke" } });
  eq(li.status === 200 && li.json.ok, "login failed");
  const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  return { cookie: String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: li.json.csrf };
}

function bundleFixture() {
  return {
    manifest: { export_schema_version: 1, app_id: "linguist-pro-web" },
    texts: [{
      text_key: TEXT_KEY, title: "Mentor home smoke text",
      rows: [
        { order_index: 0, hebrew_plain: SENT_HE, hebrew_niqqud: "", translit: "", russian: SENT_RU },
        { order_index: 1, hebrew_plain: SENT_HE, hebrew_niqqud: "", translit: "", russian: SENT_RU },
      ],
      created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z",
    }],
  };
}

(async () => {
  const C = require(path.join(REPO, "agent", "constructs.js"));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-mentor-smoke-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan :" + PORT + ")\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    // ── 1) 401-gating ─────────────────────────────────────────────────────────
    const un1 = await api("GET", "/api/agent/explanations", {});
    eq(un1.status === 401, "explanations unauth must be 401, got " + un1.status);
    const un2 = await api("GET", "/api/agent/constructs/summary", {});
    eq(un2.status === 401, "constructs/summary unauth must be 401, got " + un2.status);

    // ── сид: consents + артефакт + D1-дисбаланс due-слова ИЗ предложения ──────
    const { cookie, csrf } = await login();
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "cloud_texts", granted: true, version: require("../../public/js/cloud-sync.js").CLOUD_TEXTS_CONSENT_VERSION } });
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: true, version: "v1" } });
    const put = await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: {
      artifact_key: TEXT_KEY, updated_at: "2026-07-01T00:00:00.000Z", payload: bundleFixture(),
    } });
    eq(put.status === 200 && put.json.stored === true, "artifact put failed: " + JSON.stringify(put.json));
    const keyed = await api("POST", "/api/learner/keying/resolve", { cookie, csrf, body: {
      words: SENT_HE.split(" ").map((s) => ({ surface: s })),
    } });
    const keyable = ((keyed.json && keyed.json.results) || []).filter((r) => r.keyable && r.item_key);
    eq(keyable.length >= 1, "resolver must key at least one word of the fixture sentence");
    const dueKey = keyable[0] ? keyable[0].item_key : "unkeyable";
    const rows = [
      ["1", "2026-06-18T08:00:00.000Z", 3, "read:mc"],
      ["2", "2026-06-19T08:00:00.000Z", 3, "read:mc"],
      ["3", "2026-06-20T08:00:00.000Z", 1, "dictate:typed"],
      ["4", "2026-06-21T08:00:00.000Z", 1, "dictate:tiles"],
    ].map(([n, at, g, ch]) => ({ id: "mentor-smoke:due:" + n, item_key: dueKey, kind: "review",
      reviewed_at: at, grade: g, source: "room-recall", channel: ch,
      meta_json: JSON.stringify({ keyer_version: 1 }) }));
    const ing = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "mentor-smoke-seed", schema_version: 1, keyer_version: 1, review_log: rows,
    } });
    eq(ing.status === 200 && ing.json.review_log && ing.json.review_log.rejected === 0, "seed ingest must be clean");

    // два объяснения (order_index 0 и 1 — второй = более новая строка ленты) + план
    // (plan-task несёт construct_ids секции production_gap — второй источник агрегата)
    const e0 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 0, scope_level: "sentence_only" } });
    eq(e0.status === 200 && e0.json.ok, "explain #0 failed: " + JSON.stringify(e0.json && e0.json.error));
    const e1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 1, scope_level: "sentence_only" } });
    eq(e1.status === 200 && e1.json.ok, "explain #1 failed: " + JSON.stringify(e1.json && e1.json.error));
    eq((e1.json.constructs || []).some((c) => c.id === "construct:hebrew.channel_gap.reading_to_dictation"),
      "precondition: explain must detect reading_to_dictation (else the summary test is vacuous)");
    const p1 = await api("POST", "/api/agent/plan", { cookie, csrf, body: {} });
    eq(p1.status === 200 && p1.json.ok, "plan failed");
    const gapSec = ((p1.json.plan || {}).sections || []).find((s) => s.id === "production_gap");
    eq(!!gapSec && (gapSec.construct_ids || []).length >= 1,
      "precondition: plan must carry a production_gap section with construct_ids");

    const logBefore = await api("GET", "/api/learner/counts", { cookie });

    // ── 2) история объяснений: контент + порядок + пагинация ──────────────────
    const l1 = await api("GET", "/api/agent/explanations", { cookie });
    eq(l1.status === 200 && l1.json.ok && Array.isArray(l1.json.explanations), "explanations list failed");
    eq(l1.json.explanations.length === 2, "list must return both explanations, got " + l1.json.explanations.length);
    const [newest, oldest] = l1.json.explanations;
    eq(!!newest && newest.sentence_id === TEXT_KEY + "#1" && !!oldest && oldest.sentence_id === TEXT_KEY + "#0",
      "list must be newest-first (rowid DESC), got " + JSON.stringify(l1.json.explanations.map((x) => x.sentence_id)));
    eq(newest.anchor && newest.anchor.text_key === TEXT_KEY && newest.anchor.order_index === 1,
      "list item must carry a parsed anchor {text_key, order_index}");
    eq(newest.purged === false && typeof newest.text === "string" && newest.text.length > 0,
      "non-purged item must carry the explanation text");
    eq(newest.sentence_he === SENT_HE, "non-purged item must carry the anchored sentence (own consented data)");
    eq(newest.llm_used === true && newest.provider === "mock", "list item must carry LLM provenance");
    const pg1 = await api("GET", "/api/agent/explanations?limit=1", { cookie });
    eq(pg1.json.explanations.length === 1 && pg1.json.has_more === true && pg1.json.next_before_rid != null,
      "limit=1 must return one item + honest has_more + cursor");
    const pg2 = await api("GET", "/api/agent/explanations?limit=10&before_rid=" + pg1.json.next_before_rid, { cookie });
    eq(pg2.json.explanations.length === 1 && pg2.json.has_more === false
      && pg2.json.explanations[0].id !== pg1.json.explanations[0].id,
      "before_rid cursor must return the remaining item exactly once");

    // ── 4) constructs/summary: оба источника, ⊆ реестра, серверные титулы ─────
    const s1 = await api("GET", "/api/agent/constructs/summary", { cookie });
    eq(s1.status === 200 && s1.json.ok && Array.isArray(s1.json.constructs) && s1.json.constructs.length >= 1,
      "constructs/summary must return an aggregate");
    eq(s1.json.constructs.every((x) => C.isKnown(x.id) && !!x.title_ru && !!x.title_en && x.count >= 1),
      "summary ⊆ registry with ru/en titles, got " + JSON.stringify(s1.json.constructs.map((x) => x.id)));
    const dict = s1.json.constructs.find((x) => x.id === "construct:hebrew.channel_gap.reading_to_dictation");
    eq(!!dict && dict.from_explanations >= 1 && dict.from_plans >= 1,
      "reading_to_dictation must be counted from BOTH sources (explanations facts_used + plan-task construct_ids), got "
      + JSON.stringify(dict));

    // ── 5) MNAR: просмотр дома ничего не пишет в review_log ───────────────────
    const logAfter = await api("GET", "/api/learner/counts", { cookie });
    eq(JSON.stringify(logBefore.json) === JSON.stringify(logAfter.json),
      "MNAR: viewing the mentor home (both GETs) must write NOTHING to review_log");

    // ── 3) СТРОГО user-scoped: второй пользователь видит пусто ────────────────
    // Bootstrap-логин owner-only → user2 создаётся напрямую в scratch-БД
    // (паттерн B1 learner-ingest: настоящий multi-tenant путь, без бэкдоров).
    const sqlite3 = require(path.join(REPO, "node_modules", "sqlite3"));
    const secret2 = crypto.randomBytes(32).toString("hex");
    const hash2 = crypto.createHash("sha256").update(secret2, "utf8").digest("hex");
    const dbw = new sqlite3.Database(path.join(scratch, "app.db"));
    const runw = (sql, p) => new Promise((res2, rej) => dbw.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
    await runw(`INSERT INTO users (id, role, display_name) VALUES ('u_mentor2', 'member', 'Second')`);
    await runw(`INSERT INTO user_sessions (id, user_id, token_hash, csrf_token, expires_at) VALUES ('s_m2', 'u_mentor2', ?, 'csrf-m2', '2099-01-01T00:00:00.000Z')`, [hash2]);
    await new Promise((r) => dbw.close(() => r()));
    const cookieB = "lp_session=" + encodeURIComponent("s_m2." + secret2);
    const lB = await api("GET", "/api/agent/explanations", { cookie: cookieB });
    eq(lB.status === 200 && lB.json.ok && lB.json.explanations.length === 0 && lB.json.has_more === false,
      "user2's explanations list must be EMPTY (strict user-scoping), got " + JSON.stringify(lB.json && lB.json.explanations));
    const sB = await api("GET", "/api/agent/constructs/summary", { cookie: cookieB });
    eq(sB.status === 200 && sB.json.ok && sB.json.constructs.length === 0,
      "user2's constructs summary must be EMPTY (strict user-scoping)");

    // ── 6) purge-aware: revoke → tombstone в ленте, агрегат теряет explanation-вхождения ─
    const rv = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: false, version: "v1" } });
    eq(rv.status === 200 && rv.json.ok && rv.json.explanations && rv.json.explanations.purged >= 2,
      "revoke must purge both explanations, got " + JSON.stringify(rv.json && rv.json.explanations));
    const l2 = await api("GET", "/api/agent/explanations", { cookie });
    eq(l2.status === 200 && l2.json.explanations.length === 2
      && l2.json.explanations.every((x) => x.purged === true && x.purge_reason === "consent_revoked" && x.text == null && x.sentence_he == null),
      "after revoke the list must return honest tombstones (purged + reason, NO content)");
    const l2Str = JSON.stringify(l2.json);
    eq(!l2Str.includes(SENT_HE) && !l2Str.includes("МЕНТОРСЕНТИНЕЛ"),
      "purged list response must NOT contain the sentence or translation anywhere");
    const s2 = await api("GET", "/api/agent/constructs/summary", { cookie });
    const dict2 = (s2.json.constructs || []).find((x) => x.id === "construct:hebrew.channel_gap.reading_to_dictation");
    eq(!!dict2 && dict2.from_explanations === 0 && dict2.from_plans >= 1,
      "after revoke the summary must lose explanation-sourced occurrences (facts_used='[]') but keep plan-sourced (class A), got "
      + JSON.stringify(dict2));

    // ── 7) stdout-гигиена (класс D) ───────────────────────────────────────────
    const all = srv.logs.join("");
    eq(!all.includes(SENT_HE.split(" ")[1]) && !all.includes("МЕНТОРСЕНТИНЕЛ"),
      "class D hygiene: sentence/translation must NOT appear in server stdout/stderr");
  } catch (e) {
    failures.push("CRASH: " + ((e && e.stack) || e));
  } finally {
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const TOTAL = 25;
  if (failures.length) {
    console.error(`smoke:mentor-home FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:mentor-home OK (${TOTAL}/${TOTAL}) — P9 сервер: 401-gating обоих endpoint'ов · история объяснений (контент/якорь/LLM-провенанс, newest-first, limit+before_rid-курсор) · СТРОГО user-scoped (user2 видит пусто) · constructs/summary ⊆ реестра (оба источника: facts_used + plan-task construct_ids) · MNAR (просмотр ничего не пишет) · purge-aware (tombstone честный, контент не отдаётся; plan-вхождения класса A переживают) · stdout-гигиена класса D`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
