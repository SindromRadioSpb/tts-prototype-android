#!/usr/bin/env node
"use strict";
// smoke:agent-personal-texts — S-пакет S1 gate (LINGUISTPRO_AGENT_PERSONAL_TEXTS_S1S2_DESIGN §3):
//   • sidecar-мета: put→meta ТОЛЬКО при stored:true; state_bundle без меты; rejected-put не
//     трогает мету; char-slice(0,128) title (иврит);
//   • SQL-backfill (мигр. 050) == JS put-time экстракция (парити by construction) и НЕ падает
//     на malformed payload (json_valid-guard — BLOCKER критики);
//   • reconcile (ops-sweep) добирает пропуски derived-слоя;
//   • list_personal_texts через РЕАЛЬНЫЙ service+handlers: двухслойный гейт (INSUFFICIENT_SCOPE /
//     CONSENT_REQUIRED / RECONSENT_REQUIRED / NOT_SYNCED — все typed), пагинация, ОРАКУЛ =
//     test-side JSON.parse payload_json (не репо, не экстрактор);
//   • мигр. 049: CHECK принимает новые scope, отвергает неизвестный;
//   • supersede-on-activate: re-auth того же (клиент, пользователь) suspend'ит прежнее ACTIVE.
// Run: node scripts/premium/agent-personal-texts-smoke.js

const assert = require("assert");
const T = require("./lib/cp0-test-db");
const laRepo = require("../../db/learnerArtifactsRepo");
const oauthRepo = require("../../db/agentAccessOAuthRepo");
const identity = require("../../db/identityRepo");
const { createProductionHandlers } = require("../../agent/access/productionHandlers");
const { createAgentAccessService } = require("../../agent/access/service");

const V2 = laRepo.REQUIRED_CONSENT_VERSION;
const NOW = Date.parse("2026-07-19T10:00:00.000Z");
const EXPIRY = "2026-07-19T11:00:00.000Z";

// Внутренний text_key ОБЯЗАН равняться artifact_key (как в реальном exportBundle) —
// aa-экстрактор strict-матчит без ||texts[0]-фолбэка.
const payloadFor = (key, title, nRows) => ({
  manifest: { slim_bundle: true },
  texts: [{ text_key: key, title, rows: Array.from({ length: nRows }, (_, i) => ({ order_index: i, hebrew_plain: "שלום", russian: "привет" })) }],
});

function principalFor(scopes) {
  return {
    user_id: "u1", oauth_client_id: "client-fixture", connection_id: "conn-a",
    external_actor_id: "actor-1", request_id: "req-1", scopes,
    connection_status: "ACTIVE", access_expires_at: EXPIRY,
  };
}
async function expectCode(promise, code, label) {
  const res = await promise;
  assert.strictEqual(res && res.ok, false, label + ": must fail");
  assert.strictEqual(res.error && res.error.code, code, label + `: expected ${code}, got ` + (res.error && res.error.code));
  assert.strictEqual(res.error.retryable, false, label + ": retryable must be false");
}

(async () => {
  const ctx = await T.setup("cp0-personal-texts");
  let checks = 0;
  try {
    // ── sidecar: put → meta (только stored:true; char-slice; state_bundle мимо) ──
    const longHe = "א".repeat(200);
    await laRepo.put("u1", "dev1", { artifact_key: "text-1", updated_at: "2026-07-10T00:00:00.000Z", payload: payloadFor("text-1", "Мой первый текст", 3) });
    await laRepo.put("u1", "dev1", { artifact_key: "text-2", updated_at: "2026-07-11T00:00:00.000Z", payload: payloadFor("text-2", longHe, 7) });
    await laRepo.put("u1", "dev1", { artifact_key: "__state__", kind: "state_bundle", updated_at: "2026-07-11T00:00:00.000Z", payload: { format: "linguistpro-state-v1", state: {} } });
    const m1 = await ctx.get("SELECT title, rows_count FROM learner_artifact_meta WHERE user_id='u1' AND artifact_key='text-1'");
    assert.strictEqual(m1.title, "Мой первый текст"); assert.strictEqual(m1.rows_count, 3); checks++;
    const m2 = await ctx.get("SELECT title FROM learner_artifact_meta WHERE user_id='u1' AND artifact_key='text-2'");
    assert.strictEqual(m2.title, longHe.slice(0, 128), "char-slice(0,128), не байты"); checks++;
    assert.ok(!(await ctx.get("SELECT 1 x FROM learner_artifact_meta WHERE artifact_key='__state__'")), "state_bundle не порождает мету"); checks++;
    // rejected put (OLDER_OR_EQUAL) не трогает мету
    const rej = await laRepo.put("u1", "dev1", { artifact_key: "text-1", updated_at: "2026-07-09T00:00:00.000Z", payload: payloadFor("text-1", "ДРУГОЙ TITLE", 9) });
    assert.strictEqual(rej.stored, false);
    assert.strictEqual((await ctx.get("SELECT title FROM learner_artifact_meta WHERE artifact_key='text-1'")).title, "Мой первый текст", "мета отвергнутого payload'а не пишется"); checks++;

    // ── SQL-backfill парити + malformed-терпимость (BLOCKER-фикс критики) ──
    // Вставляем артефакты МИМО put (как «до миграции»), включая байт-мусор, и гоняем
    // ровно backfill-стейтмент мигр. 050.
    await ctx.run(`INSERT INTO learner_artifacts (user_id,kind,artifact_key,updated_at,payload_json) VALUES
      ('u2','text_bundle','pre-1','2026-07-01T00:00:00.000Z', ?),
      ('u2','text_bundle','pre-bad','2026-07-01T00:00:00.000Z', 'not json {{{'),
      ('u2','text_bundle','pre-shapeless','2026-07-01T00:00:00.000Z', '{"no_texts":true}')`,
      [JSON.stringify(payloadFor("pre-1", "Бэкфилл", 5))]);
    const backfillSql = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "migrations", "050_learner_artifact_meta.sql"), "utf8")
      .split("INSERT OR REPLACE")[1];
    await ctx.run("INSERT OR REPLACE" + backfillSql);
    const b1 = await ctx.get("SELECT title, rows_count FROM learner_artifact_meta WHERE user_id='u2' AND artifact_key='pre-1'");
    assert.strictEqual(b1.title, "Бэкфилл"); assert.strictEqual(b1.rows_count, 5); checks++;
    assert.ok(!(await ctx.get("SELECT 1 x FROM learner_artifact_meta WHERE artifact_key='pre-bad'")), "malformed скипается json_valid-гардом, миграция не падает"); checks++;
    const bs = await ctx.get("SELECT title, rows_count FROM learner_artifact_meta WHERE artifact_key='pre-shapeless'");
    assert.ok(bs && bs.title === null, "бесформенный payload → честный NULL-title"); checks++;
    // Парити SQL-backfill == JS-экстракция (тот же put-путь): прогоняем put для того же payload
    await laRepo.put("u2", "dev1", { artifact_key: "pre-1", updated_at: "2026-07-02T00:00:00.000Z", payload: payloadFor("pre-1", "Бэкфилл", 5) });
    const b2 = await ctx.get("SELECT title, rows_count FROM learner_artifact_meta WHERE user_id='u2' AND artifact_key='pre-1'");
    assert.deepStrictEqual({ t: b2.title, r: b2.rows_count }, { t: b1.title, r: b1.rows_count }, "SQL-backfill == JS put-time"); checks++;

    // ── reconcile добирает пропуски derived-слоя ──
    await ctx.run("DELETE FROM learner_artifact_meta WHERE user_id='u1' AND artifact_key='text-2'");
    const rc = await laRepo.reconcileArtifactMeta(50);
    assert.ok(rc.rebuilt >= 1);
    assert.strictEqual((await ctx.get("SELECT title FROM learner_artifact_meta WHERE artifact_key='text-2'")).title, longHe.slice(0, 128)); checks++;

    // ── list_personal_texts через реальный service (двухслойный гейт + пагинация + оракул) ──
    const stub = () => { throw new Error("UNUSED_DEP"); };
    const handlers = createProductionHandlers({
      learnerGraphRepo: { getAgentAccessReviewAggregates: stub, getDue: stub, getActivityDelta: stub },
      agentRepo: { getLatestOpenPlanAction: stub, listExplanationMetadata: stub, getProfile: stub, getExplanationById: stub },
      oauthRepo: { loadConnection: stub, listConnectionsForUser: stub },
      publicCatalog: { isReadable: () => false, search: stub },
      keyingService: { displayForItemKey: stub, glossForItemKey: stub },
      corpusSentenceRepo: { listWorkTexts: stub, getCorpusLessonWindow: stub },
      handoffRepo: { mint: stub, countActive: stub },
      agentProposalsRepo: { create: stub },
      personalTextsRepo: laRepo,
      personalTextsContentRepo: require("../../db/agentSentenceRepo"),
      textGrantsRepo: require("../../db/agentTextGrantsRepo"),
      connectionPersistence: async () => ({ access_lifetime: "PERSISTENT_WINDOW", window_expires_at: null }),
      now: () => NOW,
      principalAccessExpiresAt: () => EXPIRY,
    });
    const service = createAgentAccessService({ enabled: true, ownerIds: ["u1", "u2"], handlers, now: () => NOW });
    const SCOPE = "personal.texts.metadata.read";

    await expectCode(service.execute(principalFor(["learning.brief.read"]), "list_personal_texts", {}), "INSUFFICIENT_SCOPE", "no-scope"); checks++;
    await expectCode(service.execute(principalFor([SCOPE]), "list_personal_texts", {}), "AA_PERSONAL_TEXTS_CONSENT_REQUIRED", "no-consent"); checks++;
    await identity.recordConsent("u1", "cloud_texts", true, "v1");
    await expectCode(service.execute(principalFor([SCOPE]), "list_personal_texts", {}), "AA_PERSONAL_TEXTS_RECONSENT_REQUIRED", "v1-grant"); checks++;
    await identity.recordConsent("u1", "cloud_texts", true, V2);
    const page1 = await service.execute(principalFor([SCOPE]), "list_personal_texts", { limit: 1 });
    assert.strictEqual(page1.ok, true, "list must succeed: " + JSON.stringify(page1));
    const r1 = page1.result;
    assert.strictEqual(r1.total, 2); assert.strictEqual(r1.items.length, 1);
    assert.strictEqual(r1.authority, "OWNER_DEVICE_CANONICAL");
    assert.ok(r1.next_cursor, "пагинация: next_cursor на неполной странице"); checks++;
    const page2 = await service.execute(principalFor([SCOPE]), "list_personal_texts", { limit: 10, cursor: r1.next_cursor });
    assert.strictEqual(page2.ok, true);
    assert.strictEqual(page2.result.items.length, 1); assert.strictEqual(page2.result.next_cursor, null); checks++;
    // НЕЗАВИСИМЫЙ ОРАКУЛ: test-side JSON.parse payload_json против ответа инструмента
    const oracleRows = await ctx.all("SELECT artifact_key, updated_at, ingested_at, payload_json FROM learner_artifacts WHERE user_id='u1' AND kind='text_bundle' ORDER BY artifact_key");
    const oracle = oracleRows.map((row) => {
      let t = null; try { t = JSON.parse(row.payload_json).texts[0]; } catch (_) {}
      return { text_key: row.artifact_key, title: t && t.title != null ? String(t.title).slice(0, 128) : null, rows_count: t && Array.isArray(t.rows) ? t.rows.length : null };
    });
    const got = [...page1.result.items, ...page2.result.items].map((i) => ({ text_key: i.text_key, title: i.title, rows_count: i.rows_count }));
    assert.deepStrictEqual(got, oracle, "оракул: list == независимый парс payload_json"); checks++;
    // NO_GRADES by construction: в ответе физически нет полей заметок/оценок/SRS
    const flat = JSON.stringify(page1.result) + JSON.stringify(page2.result);
    for (const bad of ["grade", "srs", "notes_advanced", "review_log", "word_status", "body_json"]) {
      assert.ok(!flat.includes(bad), "утечка поля: " + bad);
    }
    checks++;
    // NOT_SYNCED: у u2 consent v2 есть, а артефакты почистим
    await identity.recordConsent("u2", "cloud_texts", true, V2);
    await ctx.run("DELETE FROM learner_artifacts WHERE user_id='u2'");
    await expectCode(service.execute({ ...principalFor([SCOPE]), user_id: "u2" }, "list_personal_texts", {}), "AA_PERSONAL_TEXTS_NOT_SYNCED", "empty"); checks++;

    // ── мигр. 049: CHECK нового scope (на отдельном pending-подключении, без активации) ──
    const OC = require("../../agent/access/oauthContracts");
    await oauthRepo.registerClientFixture({ oauth_client_id: "client-fixture", display_name: "Fixture", software_id: "fx", software_version: "1", redirect_uris: ["http://127.0.0.1:3210/callback"], registration_version: "v1" }, "2026-07-19T09:00:00.000Z");
    const connInput = (id) => ({ connection_id: id, oauth_client_id: "client-fixture", display_label: "Fixture", consent_version: "aa-consent-v2", capability_version: "aa-v0.1", retention_notice_version: "aa-retention-v1" });
    await oauthRepo.createPendingConnection("u1", connInput("conn-check"), "2026-07-19T09:01:00.000Z");
    const cr1 = await identity.recordConsent("u1", OC.consentKey("conn-check", SCOPE), true, "aa-consent-v2");
    await ctx.run(`INSERT INTO agent_connection_grants (grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at)
                   VALUES ('g-new','u1','conn-check',?, 'ACTIVE', ?, 'aa-consent-v2','2026-07-19T09:01:00.000Z','2026-07-19T09:01:00.000Z')`, [SCOPE, cr1]);
    checks++;
    let checkErr = null;
    try {
      await ctx.run(`INSERT INTO agent_connection_grants (grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at)
                     VALUES ('g-bad','u1','conn-check','not.a.real.scope','ACTIVE', ?, 'aa-consent-v2','2026-07-19T09:01:00.000Z','2026-07-19T09:01:00.000Z')`, [cr1]);
    } catch (e) { checkErr = e; }
    assert.ok(checkErr && /CHECK/i.test(String(checkErr.message)), "неизвестный scope отвергается CHECK-констрейнтом"); checks++;

    // ── supersede-on-activate (критика R14 №2) ──
    await oauthRepo.createPendingConnection("u1", connInput("conn-a"), "2026-07-19T09:01:30.000Z");
    await identity.recordConsent("u1", OC.consentKey("conn-a", SCOPE), true, "aa-consent-v2");
    await oauthRepo.activateConnectionWithGrants("u1", "conn-a", [SCOPE], "2026-07-19T09:02:00.000Z");
    await oauthRepo.createPendingConnection("u1", connInput("conn-b"), "2026-07-19T09:03:00.000Z");
    await identity.recordConsent("u1", OC.consentKey("conn-b", SCOPE), true, "aa-consent-v2");
    await oauthRepo.activateConnectionWithGrants("u1", "conn-b", [SCOPE], "2026-07-19T09:04:00.000Z");
    const stA = await ctx.get("SELECT status FROM agent_connections WHERE connection_id='conn-a'");
    const stB = await ctx.get("SELECT status FROM agent_connections WHERE connection_id='conn-b'");
    assert.strictEqual(stA.status, "SUSPENDED", "re-auth супersede'ит прежнее подключение (зомби с живыми refresh-токенами запрещён)");
    assert.strictEqual(stB.status, "ACTIVE"); checks++;

    // ═══ S2 — agent_text_grants + get_personal_text_content ═══
    const grantsRepo = require("../../db/agentTextGrantsRepo");
    const CSCOPE = "personal.texts.content.read";
    const pContent = (over = {}) => ({ ...principalFor([SCOPE, CSCOPE]), connection_id: "conn-b", ...over });

    // Гейт 3: scope есть, гранта нет → NOT_GRANTED
    await expectCode(service.execute(pContent(), "get_personal_text_content", { text_key: "text-1" }), "AA_TEXT_ACCESS_NOT_GRANTED", "no-grant"); checks++;
    // Выдача TTL-гранта; чтение работает; ОРАКУЛ окна = test-side parse payload_json
    const iss = await grantsRepo.issueGrant("u1", "conn-b", { ttlDays: 30 });
    assert.strictEqual(iss.ok, true); assert.ok(iss.expires_at, "TTL-грант несёт expires_at");
    const win = await service.execute(pContent(), "get_personal_text_content", { text_key: "text-1", rows: 2 });
    assert.strictEqual(win.ok, true, "content must succeed: " + JSON.stringify(win));
    const oPayload = JSON.parse((await ctx.get("SELECT payload_json FROM learner_artifacts WHERE user_id='u1' AND artifact_key='text-1'")).payload_json);
    const oRows = oPayload.texts[0].rows.slice(0, 2).map((r) => ({ order_index: r.order_index, he: r.hebrew_plain, ru: r.russian }));
    assert.deepStrictEqual(win.result.rows.map((r) => ({ order_index: r.order_index, he: r.he, ru: r.ru })), oRows, "оракул окна");
    assert.strictEqual(win.result.has_more, true); assert.strictEqual(win.result.rows_total, 3);
    assert.strictEqual(win.result.authority, "OWNER_DEVICE_CANONICAL"); checks++;
    // Грант per-connection: чужое подключение (conn-a) права НЕ получает
    await expectCode(service.execute(pContent({ connection_id: "conn-a" }), "get_personal_text_content", { text_key: "text-1" }), "AA_TEXT_ACCESS_NOT_GRANTED", "wrong-connection"); checks++;
    // NOT_FOUND / UNREADABLE (битый артефакт вставлен мимо put)
    await expectCode(service.execute(pContent(), "get_personal_text_content", { text_key: "text-none" }), "AA_PERSONAL_TEXT_NOT_FOUND", "not-found"); checks++;
    await ctx.run(`INSERT INTO learner_artifacts (user_id,kind,artifact_key,updated_at,payload_json) VALUES ('u1','text_bundle','text-broken','2026-07-01T00:00:00.000Z','{"no_texts":1}')`);
    await expectCode(service.execute(pContent(), "get_personal_text_content", { text_key: "text-broken" }), "AA_ARTIFACT_UNREADABLE", "unreadable"); checks++;
    // Адаптивное сужение: гигант-строки не делают окно нечитаемым (byte-slice per-row + shrink)
    const giant = { manifest: {}, texts: [{ text_key: "text-giant", title: "Г", rows: Array.from({ length: 20 }, (_, i) => ({ order_index: i, hebrew_plain: "ש".repeat(3000), russian: "р".repeat(3000) })) }] };
    await laRepo.put("u1", "dev1", { artifact_key: "text-giant", updated_at: "2026-07-12T00:00:00.000Z", payload: giant });
    const gwin = await service.execute(pContent(), "get_personal_text_content", { text_key: "text-giant", rows: 20 });
    assert.strictEqual(gwin.ok, true, "гигант-окно обязано отдаться (сжатое): " + JSON.stringify(gwin.ok ? {} : gwin));
    assert.ok(gwin.result.rows.length >= 1 && gwin.result.has_more === true, "shrink honest: rows=" + gwin.result.rows.length); checks++;

    // R17: подавление личнотекстовых cloze при живом гранте (единая точка selectClozeChallenge;
    // гейт срабатывает ДО тяжёлого keyingService — ранний return, смоук это и проверяет)
    await identity.recordConsent("u1", "agent_read_texts", true, "v1");
    const clozeRepo = require("../../db/agentClozeRepo");
    const supp = await clozeRepo.selectClozeChallenge("u1", ["k1"], () => false);
    assert.deepStrictEqual(supp, { none: "agent_grant_active" }, "cloze подавлен при живом гранте: " + JSON.stringify(supp)); checks++;

    // Каскад: revoke подключения → грант отозван → EXPIRED/NOT_GRANTED
    await oauthRepo.revokeConnection("u1", "conn-b", "OWNER_REVOKE");
    const gAfterRevoke = await grantsRepo.activeGrant("u1");
    assert.strictEqual(gAfterRevoke.state, "NONE", "status-флип подключения гасит грант через JOIN-предикат"); checks++;
    // (роут добавляет и явный revokeForConnection — проверяем идемпотентность)
    await grantsRepo.revokeForConnection("u1", "conn-b");
    // Новый грант на живом подключении... conn-b REVOKED — переактивируем цепочку через новое подключение
    await oauthRepo.createPendingConnection("u1", connInput("conn-c"), "2026-07-19T09:05:00.000Z");
    await identity.recordConsent("u1", OC.consentKey("conn-c", SCOPE), true, "aa-consent-v2");
    await oauthRepo.activateConnectionWithGrants("u1", "conn-c", [SCOPE], "2026-07-19T09:06:00.000Z");
    const iss2 = await grantsRepo.issueGrant("u1", "conn-c", { ttlDays: null });
    assert.strictEqual(iss2.ok, true); assert.strictEqual(iss2.expires_at, null, "PERSISTENT-грант без expires_at");
    // Каскад отзыва cloud_texts (revokeAllForUser — как в consent-роуте)
    await grantsRepo.revokeAllForUser("u1");
    assert.strictEqual((await grantsRepo.activeGrant("u1")).state, "NONE", "cloud_texts-каскад отзывает гранты"); checks++;
    // Expired: грант с истёкшим TTL → EXPIRED (typed, отличим от NOT_GRANTED)
    const iss3 = await grantsRepo.issueGrant("u1", "conn-c", { ttlDays: 1 });
    await ctx.run("UPDATE agent_text_grants SET expires_at='2026-07-01T00:00:00.000Z' WHERE grant_id=?", [iss3.grant_id]);
    assert.strictEqual((await grantsRepo.activeGrant("u1")).state, "EXPIRED"); checks++;
    // После гашения всех грантов подавление снято by construction (гейт читает activeGrant;
    // сам селектор дальше не гоняем — _dueVocMap лениво грузит 306МБ-лексикон, не для смоука).
    await ctx.run("UPDATE agent_text_grants SET revoked_at='2026-07-19T09:07:00.000Z' WHERE revoked_at IS NULL");
    assert.notStrictEqual((await grantsRepo.activeGrant("u1")).state, "ACTIVE", "живых грантов нет — ключ подавления снят"); checks++;

    console.log(JSON.stringify({ ok: true, checks }));
  } catch (e) {
    console.error("smoke:agent-personal-texts FAIL:", e && e.stack || e);
    process.exitCode = 1;
  } finally {
    await T.cleanup(ctx);
  }
})();
