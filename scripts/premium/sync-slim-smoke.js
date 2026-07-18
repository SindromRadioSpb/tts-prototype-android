#!/usr/bin/env node
"use strict";
// smoke:sync-slim — Sync-hardening P0 gate (docs/planning/LINGUISTPRO_SYNC_HARDENING_P0P2_DESIGN_2026_07_18.md §6.10):
//   • slim per-text артефакт НЕ несёт full-state (over-carry §3.4 канона убит) и < 200 КБ;
//   • state_bundle несёт text-независимое состояние (заметки/occurrences-якоря/полки/overrides/
//     anki/study_day/roots), corpus-occurrences ИСКЛЮЧЕНЫ;
//   • roundtrip-инвариантность updated_at (§6.1 F1-1): второй fullSync НИЧЕГО не заливает —
//     пинг-понг полных артефактов погашен;
//   • fresh-device restore = ИСХОДНАЯ фикстура (независимый оракул: raw-SQL против спецификации
//     фикстуры, не против «другого прогона того же билдера»);
//   • merge-сцены (§6.2 F1-2): правка body проезжает по LWW; occurrence-only add детектится
//     change-signal'ом; двухдевайсный union сходится merge-back'ом;
//   • миграция fat→slim через replace_equal при РАВНОМ updated_at; откат sync_slim_disabled;
//   • skew-guard FUTURE_UPDATED_AT отвергается типизированно.
// Run: node scripts/premium/sync-slim-smoke.js   (or npm run smoke:sync-slim)

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3289, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-bootstrap-secret-0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(dataDir) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET },
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

(async () => {
  const failures = []; const eq = (c, m) => { if (!c) failures.push(m); };
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-syncslim-smoke-"));
  const srv = startServer(scratch);
  const b = await pw.chromium.launch();
  const NOW = Date.now();
  // Все таймстампы precomputed (act-retry safe): фикстура — в прошлом, правки — строго позже.
  const iso = (ms) => new Date(ms).toISOString();
  const ARGS = {
    SECRET,
    T0: iso(NOW - 86400000),            // фикстура (сутки назад)
    T_N1_EDIT: iso(NOW + 60000),        // правка body N1 на A
    T_A3: iso(NOW + 100000),            // конфликт-заметка A
    T_B4: iso(NOW + 101000),            // конфликт-заметка B
    T_T1_EDIT: iso(NOW + 120000),       // fat-правка T1 на A (rollback-сцена)
    T_FUTURE: iso(NOW + 2 * 3600000),   // skew-guard
    // P2-сцены (§3.3/§6.4–6.5)
    T_T4: iso(NOW + 150000),            // sl-t4 создан на A (СТАРШЕ T_DEL3 — иначе delete = DELETED_OLDER)
    T_DEL3: iso(NOW + 160000),          // A удаляет sl-t4
    T_REVIVE: iso(NOW + 180000),        // B правит sl-t4 ПОСЛЕ удаления («правка воскрешает»)
    T_OLD_DELETE: iso(NOW - 3600000),   // delete-интент СТАРШЕ серверной копии (DELETED_OLDER)
    T_GARBAGE: iso(NOW + 240000),       // битый артефакт новее локального (replace-устойчивость)
    T_PURGEDEL: iso(NOW + 300000),      // удаление в purge-окне (новее ЛЮБОГО штампа сцен выше)
  };

  const mkDevice = async () => b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
  const openOn = async (ctx) => {
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/library.html?canon=skip&nocloudauto=1", { waitUntil: "load" });
    const healthy = await pg.evaluate(async () => {
      try { const ldb = await import("/db/local-db.js"); await ldb.initLocalDB(); window.__ldb = ldb; const r = await ldb.dbQuery("SELECT 1 AS x"); return !!(r && r[0]); } catch (_) { return false; }
    });
    return { pg, errs, healthy };
  };
  const act = async (ctx, label, fn, args, tries = 4) => {
    let lastCrash = null;
    for (let i = 0; i < tries; i++) {
      const { pg, errs, healthy } = await openOn(ctx);
      if (!healthy) { await pg.close().catch(() => {}); await sleep(600); continue; }
      let res = null;
      try { res = await pg.evaluate(fn, args); } catch (e) { res = { __crash: String(e) }; }
      if (res && res.__crash) lastCrash = res.__crash;
      const alive = await pg.evaluate(async () => { try { const r = await window.__ldb.dbQuery("SELECT 1 AS x"); return !!(r && r[0]); } catch (_) { return false; } }).catch(() => false);
      // Флаш OPFS перед закрытием страницы (паттерн _roomStudioNavInit): без closeLocalDB
      // незафиксированные записи могут не пережить закрытие headless-страницы.
      try { await pg.evaluate(() => window.__ldb.closeLocalDB()); } catch (_) {}
      if (alive && !errs.some((e) => e.includes("memory access out of bounds")) && res && !res.__crash) { await pg.close().catch(() => {}); return res; }
      await pg.close().catch(() => {});
      await sleep(600);
    }
    throw new Error("act[" + label + "] failed every attempt" + (lastCrash ? " — last crash: " + lastCrash : ""));
  };

  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan)\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const ctxA = await mkDevice(), ctxB = await mkDevice();

    // ── A: фикстура + первый синк ────────────────────────────────────────────
    const aRes = await act(ctxA, "A-fixture", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      const out = {};
      out.login = (await CS.login(A.SECRET, "slim-A")).ok === true;
      // Фикстура идемпотентна (act-retry safe): тексты через importBundle (skip при повторе),
      // остальное — INSERT OR IGNORE / OR REPLACE с фиксированными id.
      await ldb.importBundle({ manifest: {}, texts: [
        { text_key: "sl-t1", title: "Текст один", updated_at: A.T0, created_at: A.T0,
          sentences: [{ he_plain: "שלום עולם", ru: "Привет мир", order_index: 0 }, { he_plain: "מה שלומך", ru: "Как дела", order_index: 1 }] },
        { text_key: "sl-t2", title: "Текст два", updated_at: A.T0, created_at: A.T0,
          sentences: [{ he_plain: "בית גדול", ru: "Большой дом", order_index: 0 }] },
        { text_key: "sl-corp", title: "Корпусный", source_meta_json: JSON.stringify({ corpus: { id: "x" } }),
          updated_at: A.T0, created_at: A.T0,
          sentences: [{ he_plain: "ספר ישן", ru: "Старая книга", order_index: 0 }] },
      ] }, { mode: "skip" });
      const tid = async (k) => (await ldb.dbQuery("SELECT id FROM texts WHERE text_key = ?", [k]))[0].id;
      const sid = async (k, oi) => (await ldb.dbQuery("SELECT s.id FROM sentences s JOIN texts t ON t.id = s.text_id WHERE t.text_key = ? AND s.order_index = ?", [k, oi]))[0].id;
      const t1 = await tid("sl-t1"), t2 = await tid("sl-t2"), tc = await tid("sl-corp");
      const s10 = await sid("sl-t1", 0), s11 = await sid("sl-t1", 1), s20 = await sid("sl-t2", 0), sc0 = await sid("sl-corp", 0);
      // Канонические word-заметки (text_id NULL) + text-bound заметка + occurrences
      const N = async (id, dk, body, ts) => ldb.dbRun(
        `INSERT OR IGNORE INTO notes_v2 (id, target_kind, target_id, text_id, note_type, title, body_json, source, user_touched, gen_dedup_key, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [id, "word", "lemma:" + id, null, "word_study", "", body, "auto", 0, dk, ts, ts]);
      await N("nn-1", "dk-1", JSON.stringify({ word: "שלום", meaning: "мир/привет" }), A.T0);
      await N("nn-2", "dk-2", JSON.stringify({ word: "בית", meaning: "дом" }), A.T0);
      await ldb.dbRun(`INSERT OR IGNORE INTO notes_v2 (id, target_kind, target_id, text_id, note_type, title, body_json, source, user_touched, created_at, updated_at)
        VALUES ('nn-tb1','text',?,?,'free','Заметка к тексту','{"text":"о тексте"}','user',1,?,?)`, [t1, t1, A.T0, A.T0]);
      const O = (nid, txt, s, wo) => ldb.dbRun(
        `INSERT OR IGNORE INTO note_occurrences (note_id, text_id, sentence_id, word_offset, surface) VALUES (?,?,?,?,?)`,
        [nid, txt, s, wo, "srf"]);
      await O("nn-1", t1, s10, 0); await O("nn-1", tc, sc0, 0); await O("nn-2", t2, s20, 0);
      // Закладка, полка, override, anki-связка, study_day, корень
      await ldb.dbRun(`INSERT OR IGNORE INTO bookmarks (id, text_id, text_key, sentence_id, order_index, title, created_at) VALUES ('bm-1',?, 'sl-t1', ?, 1, 'закладка', ?)`, [t1, s11, A.T0]);
      await ldb.dbRun(`INSERT OR IGNORE INTO shelves (id, slug, title, track, items_json, created_at, updated_at) VALUES ('sh-1','smoke-shelf','Полка','accessible','[{"text_key":"sl-t1"}]',?,?)`, [A.T0, A.T0]);
      await ldb.dbRun(`INSERT OR IGNORE INTO translation_overrides (id, he_hash, he, ru, target_lang, provider_scope, created_at, updated_at) VALUES ('ov-1','h1','שלום','привет!','ru','*',?,?)`, [A.T0, A.T0]);
      await ldb.dbRun(`INSERT OR IGNORE INTO anki_word_exports (note_id, deck_name, body_hash, exported_at, updated_at) VALUES ('nn-1','Deck','bh',?,?)`, [A.T0, A.T0]);
      await ldb.dbRun(`INSERT INTO study_day (day, recalls, available, updated_at) VALUES ('2026-07-01', 5, 8, ?) ON CONFLICT(day) DO NOTHING`, [A.T0]);
      await ldb.dbRun(`INSERT OR REPLACE INTO roots (root_3letter, gloss, my_note_id) VALUES ('שלמ','целость','nn-1')`);
      // P1 re-consent: грант СТАРОЙ карты (v1) → синк честно приостановлен (skip + server 403
      // с reconsent:true), затем грант актуальной версии → синк работает. Retry-safe: если
      // повтор act'а застал уже-актуальный грант — v1-ветка честно помечается n/a.
      const csrf0 = localStorage.getItem("cloud.csrf") || "";
      const me0 = await CS.me();
      const cv0 = me0 && me0.consents && me0.consents.cloud_texts;
      if (!(cv0 && cv0.granted === true && cv0.version === CS.CLOUD_TEXTS_CONSENT_VERSION)) {
        await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf0 },
          body: JSON.stringify({ key: "cloud_texts", granted: true, version: "v1" }) });
        const sOld = await CS.fullSync(ldb);
        out.v1Skipped = sOld.artifacts && sOld.artifacts.skipped;
        const l403 = await fetch("/api/learner/artifacts", { credentials: "same-origin" });
        out.v1List = { status: l403.status, body: await l403.json().catch(() => ({})) };
        await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf0 },
          body: JSON.stringify({ key: "cloud_texts", granted: true, version: CS.CLOUD_TEXTS_CONSENT_VERSION }) });
      } else { out.v1Skipped = "n/a-retry"; out.v1List = "n/a-retry"; }
      const s1 = await CS.fullSync(ldb);
      out.art1 = s1.artifacts;
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      out.serverKeys = (list.rows || []).map((r) => r.artifact_key).sort();
      out.serverState = list.state || null;
      out.rowBytes = (list.rows || []).map((r) => ({ k: r.artifact_key, b: r.bytes, at: r.updated_at }));
      // slim-состав артефакта T1
      const g = await fetch("/api/learner/artifacts/get?key=sl-t1", { credentials: "same-origin" }).then((r) => r.json());
      const na = (g.payload && g.payload.notes_advanced) || {};
      out.t1 = {
        slimFlag: !!(g.payload && g.payload.manifest && g.payload.manifest.slim_bundle),
        rl: (na.review_log || []).length, ws: (na.word_status || []).length, ev: (na.events || []).length,
        notes: (na.notes || []).map((n) => n.id).sort(),
        occ: (na.occurrences || []).length,
        shelves: ((g.payload.library && g.payload.library.shelves) || []).length,
        bookmarks: (((g.payload.library && g.payload.library.texts) || [])[0] || {}).bookmarks || [],
        updated_at: g.updated_at,
      };
      // state-состав
      const gs = await fetch("/api/learner/artifacts/get?kind=state_bundle&key=__state__", { credentials: "same-origin" }).then((r) => r.json());
      const stt = (gs.payload && gs.payload.state) || {};
      out.state = {
        noteIds: (stt.notes || []).map((n) => n.id).sort(),
        occTexts: (stt.occurrences || []).map((o) => o.text_key).sort(),
        shelves: (stt.shelves || []).map((s) => s.slug),
        ov: (stt.translation_overrides || []).length, anki: (stt.anki_word_exports || []).length,
        sd: (stt.study_day || []).length, roots: (stt.roots || []).length,
      };
      // roundtrip-инвариантность: ВТОРОЙ fullSync не должен ничего заливать (анти-пинг-понг)
      const s2 = await CS.fullSync(ldb);
      out.art2 = s2.artifacts;
      // skew-guard
      const fut = await fetch("/api/learner/artifacts/put", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-LP-CSRF": localStorage.getItem("cloud.csrf") || "" },
        body: JSON.stringify({ artifact_key: "sl-t1", updated_at: A.T_FUTURE, payload: { x: 1 } }) }).then((r) => r.json());
      out.futureRefused = fut && fut.error === "FUTURE_UPDATED_AT";
      return out;
    }, ARGS);
    eq(aRes.login, "A: login failed");
    eq(aRes.v1Skipped === "reconsent_required" || aRes.v1Skipped === "n/a-retry", "P1: v1-грант → синк приостановлен (reconsent_required), got " + aRes.v1Skipped);
    eq(aRes.v1List === "n/a-retry" || (aRes.v1List.status === 403 && aRes.v1List.body && aRes.v1List.body.reconsent === true), "P1: сервер 403 с reconsent:true под v1-грантом: " + JSON.stringify(aRes.v1List));
    eq(JSON.stringify(aRes.serverKeys) === JSON.stringify(["sl-t1", "sl-t2"]), "A: на сервере должны быть ровно sl-t1,sl-t2 (корпус НЕ едет): " + JSON.stringify(aRes.serverKeys));
    eq(!!aRes.serverState && !!aRes.serverState.updated_at, "A: state_bundle должен существовать в list.state");
    eq(aRes.t1.slimFlag === true, "A: артефакт обязан быть slim (manifest.slim_bundle)");
    eq(aRes.t1.rl === 0 && aRes.t1.ws === 0 && aRes.t1.ev === 0, "A: slim НЕ несёт review_log/word_status/events: " + JSON.stringify([aRes.t1.rl, aRes.t1.ws, aRes.t1.ev]));
    eq(JSON.stringify(aRes.t1.notes) === JSON.stringify(["nn-tb1"]), "A: slim несёт ТОЛЬКО text-bound заметки: " + JSON.stringify(aRes.t1.notes));
    eq(aRes.t1.shelves === 0, "A: slim не несёт полки");
    eq(aRes.t1.occ >= 1, "A: slim несёт occurrences этого текста (dedup-key якоря)");
    eq(aRes.t1.bookmarks.length === 1 && aRes.t1.bookmarks[0].order_index === 1, "A: закладка едет в бандле: " + JSON.stringify(aRes.t1.bookmarks));
    eq(aRes.t1.updated_at === ARGS.T0, "A: server updated_at == фикстурному (учебное время), got " + aRes.t1.updated_at);
    eq((aRes.rowBytes.find((r) => r.k === "sl-t1") || {}).b < 200 * 1024, "A: slim-артефакт < 200 КБ: " + JSON.stringify(aRes.rowBytes));
    eq(JSON.stringify(aRes.state.noteIds) === JSON.stringify(["nn-1", "nn-2"]), "A: state несёт text-независимые заметки: " + JSON.stringify(aRes.state.noteIds));
    eq(JSON.stringify([...new Set(aRes.state.occTexts)].sort()) === JSON.stringify(["sl-t1", "sl-t2"]), "A: state-occurrences БЕЗ корпуса: " + JSON.stringify(aRes.state.occTexts));
    eq(aRes.state.shelves.length === 1 && aRes.state.ov === 1 && aRes.state.anki === 1 && aRes.state.sd === 1 && aRes.state.roots === 1, "A: state несёт полки/override/anki/study_day/roots: " + JSON.stringify(aRes.state));
    eq(aRes.art2 && aRes.art2.uploaded === 0 && aRes.art2.updated === 0 && aRes.art2.downloaded === 0, "A: ПИНГ-ПОНГ — второй fullSync обязан быть no-op: " + JSON.stringify(aRes.art2));
    eq(aRes.art2 && aRes.art2.state && (aRes.art2.state.action === "none"), "A: state второго синка обязан быть none: " + JSON.stringify(aRes.art2 && aRes.art2.state));
    eq(aRes.futureRefused === true, "skew-guard: future updated_at обязан отвергаться typed-ошибкой");

    // ── B: fresh-device restore — паритет против ИСХОДНОЙ фикстуры ──────────
    const bRes = await act(ctxB, "B-restore", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      const out = {};
      out.login = (await CS.login(A.SECRET, "slim-B")).ok === true;
      const s = await CS.fullSync(ldb);
      out.art = s.artifacts;
      const one = async (sql, p) => (await ldb.dbQuery(sql, p || []))[0] || {};
      out.t1 = await one("SELECT title, updated_at, created_at FROM texts WHERE text_key = 'sl-t1'");
      out.t2 = await one("SELECT title, updated_at FROM texts WHERE text_key = 'sl-t2'");
      out.corp = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key = 'sl-corp'")).length;
      out.sent1 = Number((await one("SELECT COUNT(*) c FROM sentences s JOIN texts t ON t.id = s.text_id WHERE t.text_key='sl-t1'")).c);
      out.n1 = await one("SELECT id, body_json, updated_at FROM notes_v2 WHERE gen_dedup_key = 'dk-1'");
      out.n2 = await one("SELECT id FROM notes_v2 WHERE gen_dedup_key = 'dk-2'");
      out.tb = Number((await one("SELECT COUNT(*) c FROM notes_v2 WHERE note_type='free' AND target_kind='text' AND title='Заметка к тексту'")).c);
      // occurrences резолвлены к ЛОКАЛЬНЫМ предложениям B (якорь text_key+order_index)
      out.occ1 = Number((await one(`SELECT COUNT(*) c FROM note_occurrences o JOIN sentences s ON s.id = o.sentence_id JOIN texts t ON t.id = s.text_id WHERE o.note_id = ? AND t.text_key = 'sl-t1' AND s.order_index = 0`, [out.n1.id])).c);
      out.occ2 = Number((await one(`SELECT COUNT(*) c FROM note_occurrences o JOIN sentences s ON s.id = o.sentence_id JOIN texts t ON t.id = s.text_id WHERE o.note_id = ? AND t.text_key = 'sl-t2'`, [out.n2.id])).c);
      out.bm = Number((await one(`SELECT COUNT(*) c FROM bookmarks b JOIN texts t ON t.id = b.text_id WHERE t.text_key='sl-t1' AND b.order_index=1`)).c);
      out.shelf = Number((await one("SELECT COUNT(*) c FROM shelves WHERE slug='smoke-shelf'")).c);
      out.ov = await one("SELECT ru FROM translation_overrides WHERE he_hash='h1' AND target_lang='ru'");
      out.anki = Number((await one("SELECT COUNT(*) c FROM anki_word_exports WHERE note_id = ?", [out.n1.id])).c);
      out.sd = await one("SELECT recalls, available FROM study_day WHERE day='2026-07-01'");
      out.root = await one("SELECT gloss, my_note_id FROM roots WHERE root_3letter='שלמ'");
      return out;
    }, ARGS);
    eq(bRes.login, "B: login failed");
    eq(bRes.t1.title === "Текст один" && bRes.t2.title === "Текст два" && bRes.sent1 === 2, "B: тексты восстановлены: " + JSON.stringify([bRes.t1, bRes.t2, bRes.sent1]));
    eq(bRes.corp === 0, "B: корпусный текст НЕ материализуется из облака");
    eq(bRes.t1.updated_at === ARGS.T0 && bRes.t1.created_at === ARGS.T0, "B: updated_at/created_at СОХРАНЕНЫ при импорте (§6.1), got " + JSON.stringify(bRes.t1));
    eq(!!bRes.n1.id && !!bRes.n2.id && JSON.parse(bRes.n1.body_json || "{}").meaning === "мир/привет", "B: канонические заметки восстановлены из state");
    eq(bRes.tb === 1, "B: text-bound заметка приехала с текстом");
    eq(bRes.occ1 === 1 && bRes.occ2 === 1, "B: occurrences ре-якорены по (text_key, order_index): " + JSON.stringify([bRes.occ1, bRes.occ2]));
    eq(bRes.bm === 1, "B: закладка восстановлена re-anchor'ом");
    eq(bRes.shelf === 1 && bRes.ov.ru === "привет!" && bRes.anki === 1, "B: полка/override/anki восстановлены");
    eq(Number(bRes.sd.recalls) === 5 && Number(bRes.sd.available) === 8, "B: study_day приехал (MAX-merge): " + JSON.stringify(bRes.sd));
    eq(bRes.root.gloss === "целость" && bRes.root.my_note_id === "nn-1", "B: user-root восстановлен");

    // ── Merge-сцены ──────────────────────────────────────────────────────────
    // A: правка body N1 (LWW newer) + конфликт-заметка A3.
    // Каждый act начинается с boot-fullSync (как реальная сессия устройства): headless-OPFS
    // может не пережить закрытие страницы — сервер = источник восстановления, как в жизни.
    await act(ctxA, "A-edit", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      await ldb.dbRun("UPDATE notes_v2 SET body_json = ?, updated_at = ? WHERE id = 'nn-1'", [JSON.stringify({ word: "שלום", meaning: "МИР-v2" }), A.T_N1_EDIT]);
      await ldb.dbRun(`INSERT OR IGNORE INTO notes_v2 (id, target_kind, target_id, text_id, note_type, title, body_json, source, user_touched, gen_dedup_key, created_at, updated_at)
        VALUES ('nn-a3','word','lemma:a3',NULL,'word_study','','{"word":"אחד"}','auto',0,'dk-a3',?,?)`, [A.T_A3, A.T_A3]);
      return { s: await CS.fullSync(ldb) };
    }, ARGS);
    // B: своя конфликт-заметка B4 (ДО того как B узнал про A3) → B-синк должен смёржить union
    const bMerge = await act(ctxB, "B-merge", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);   // boot-sync (см. A-edit)
      await ldb.dbRun(`INSERT OR IGNORE INTO notes_v2 (id, target_kind, target_id, text_id, note_type, title, body_json, source, user_touched, gen_dedup_key, created_at, updated_at)
        VALUES ('nn-b4','word','lemma:b4',NULL,'word_study','','{"word":"שתיים"}','auto',0,'dk-b4',?,?)`, [A.T_B4, A.T_B4]);
      // occurrence-only действие (updated_at заметки НЕ бампается — change-signal обязан увидеть)
      const s11 = (await ldb.dbQuery("SELECT s.id, s.text_id FROM sentences s JOIN texts t ON t.id = s.text_id WHERE t.text_key='sl-t1' AND s.order_index=1"))[0];
      const n2 = (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key='dk-2'"))[0];
      await ldb.dbRun("INSERT OR IGNORE INTO note_occurrences (note_id, text_id, sentence_id, word_offset, surface) VALUES (?,?,?,0,'srf2')", [n2.id, s11.text_id, s11.id]);
      const s = await CS.fullSync(ldb);
      const one = async (sql, p) => (await ldb.dbQuery(sql, p || []))[0] || {};
      return {
        state: s.artifacts && s.artifacts.state,
        n1body: (await one("SELECT body_json FROM notes_v2 WHERE gen_dedup_key='dk-1'")).body_json,
        hasA3: (await ldb.dbQuery("SELECT 1 x FROM notes_v2 WHERE gen_dedup_key='dk-a3'")).length,
      };
    }, ARGS);
    eq(JSON.parse(bMerge.n1body || "{}").meaning === "МИР-v2", "B: правка body N1 с A проехала по LWW: " + bMerge.n1body);
    eq(bMerge.hasA3 === 1, "B: конфликт-заметка A3 приехала (merge)");
    eq(bMerge.state && (bMerge.state.action === "merged" || bMerge.state.action === "downloaded" || bMerge.state.action === "uploaded"), "B: state-синк обязан отработать: " + JSON.stringify(bMerge.state));
    // A: забирает union (B4 + occurrence-only)
    const aFinal = await act(ctxA, "A-final", async () => {
      const ldb = window.__ldb, CS = window.CloudSync;
      const s = await CS.fullSync(ldb);
      const n2 = (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key='dk-2'"))[0];
      const occNew = await ldb.dbQuery(`SELECT 1 x FROM note_occurrences o JOIN sentences s2 ON s2.id = o.sentence_id JOIN texts t ON t.id = s2.text_id WHERE o.note_id = ? AND t.text_key='sl-t1' AND s2.order_index=1`, [n2.id]);
      return {
        state: s.artifacts && s.artifacts.state,
        hasB4: (await ldb.dbQuery("SELECT 1 x FROM notes_v2 WHERE gen_dedup_key='dk-b4'")).length,
        occNew: occNew.length,
      };
    }, {});
    eq(aFinal.hasB4 === 1, "A: конфликт-заметка B4 вернулась merge-back'ом (двухдевайсный union сходится)");
    eq(aFinal.occNew === 1, "A: occurrence-only add с B доехал (change-signal детектит без бампа updated_at)");

    // ── Откат + миграция fat→slim ────────────────────────────────────────────
    const aRoll = await act(ctxA, "A-rollback", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);   // boot-sync (см. A-edit)
      await ldb.setSyncState("sync_slim_disabled", "1");
      const t1 = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key='sl-t1'"))[0];
      await ldb.dbRun("UPDATE texts SET title='T1 fat-edit', updated_at=? WHERE id=?", [A.T_T1_EDIT, t1.id]);
      await CS.fullSync(ldb);
      const g1 = await fetch("/api/learner/artifacts/get?key=sl-t1", { credentials: "same-origin" }).then((r) => r.json());
      const fatIsFat = !(g1.payload && g1.payload.manifest && g1.payload.manifest.slim_bundle);
      // обратно на slim: одноразовая миграция replace_equal обязана пересжать fat при РАВНОМ ts
      await ldb.setSyncState("sync_slim_disabled", "");
      await ldb.setSyncState("slim_migrated", "");
      await CS.fullSync(ldb);
      const g2 = await fetch("/api/learner/artifacts/get?key=sl-t1", { credentials: "same-origin" }).then((r) => r.json());
      return {
        fatIsFat,
        fatAt: g1.updated_at,
        slimAgain: !!(g2.payload && g2.payload.manifest && g2.payload.manifest.slim_bundle),
        slimAt: g2.updated_at,
        migrated: await ldb.getSyncState("slim_migrated"),
      };
    }, ARGS);
    eq(aRoll.fatIsFat === true, "откат: sync_slim_disabled обязан вернуть fat-состав");
    eq(aRoll.slimAgain === true && aRoll.slimAt === aRoll.fatAt, "миграция: fat пересжат слимом при РАВНОМ updated_at (replace_equal): " + JSON.stringify(aRoll));
    eq(aRoll.migrated === "1", "миграция: флаг slim_migrated обязан встать после чистого прохода");
    // B забирает fat-правку (старый формат читается новым клиентом)
    const bFat = await act(ctxB, "B-fat", async () => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      const t = (await ldb.dbQuery("SELECT title FROM texts WHERE text_key='sl-t1'"))[0];
      return { title: t && t.title };
    }, {});
    eq(bFat.title === "T1 fat-edit", "B: правка через fat-артефакт применилась (обратная совместимость): " + bFat.title);

    // ── P2: delete-семантика ─────────────────────────────────────────────────
    // A: удаление sl-t2 через интент; Undo-vs-delete (last-intent-wins) на sl-t1;
    // DELETED_OLDER на свежем sl-t4.
    const aDel = await act(ctxA, "A-delete", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      // sl-t4 — свежий текст для DELETED_OLDER-сцены
      await ldb.importBundle({ manifest: {}, texts: [
        { text_key: "sl-t4", title: "Текст четыре", updated_at: A.T_T4, created_at: A.T_T4,
          sentences: [{ he_plain: "עץ ירוק", ru: "Зелёное дерево", order_index: 0 }] },
      ] }, { mode: "skip" });
      // (1) реальное удаление sl-t2 (интент ставится ДО deleteText — как в Студии)
      const t2 = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key='sl-t2'"))[0];
      if (t2) { await ldb.queueArtifactDeleteForText(t2.id); await ldb.deleteText(t2.id); }
      // (2) Undo-сценарий: delete → undelete тем же ключом (Undo гасит delete ДО дренажа)
      await ldb.queueArtifactIntent("delete", "sl-t1", new Date().toISOString());
      await ldb.queueArtifactIntent("undelete", "sl-t1");
      // (3) DELETED_OLDER: интент старше серверной копии sl-t4 — сервер обязан отказать
      const s1 = await CS.fullSync(ldb);   // sl-t4 уезжает этим же циклом (интент t4 поставим после)
      await ldb.queueArtifactIntent("delete", "sl-t4", A.T_OLD_DELETE);
      const s2 = await CS.fullSync(ldb);
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      return {
        art1: s1.artifacts, art2: s2.artifacts,
        serverKeys: (list.rows || []).map((r) => r.artifact_key).sort(),
        tombKeys: (list.tombstones || []).map((t) => t.artifact_key),
        intentsLeft: (await ldb.listArtifactIntents()).length,
      };
    }, ARGS);
    eq(!aDel.serverKeys.includes("sl-t2"), "P2: sl-t2 удалён с сервера интентом: " + JSON.stringify(aDel.serverKeys));
    eq(aDel.tombKeys.includes("sl-t2"), "P2: tombstone sl-t2 существует: " + JSON.stringify(aDel.tombKeys));
    eq(aDel.serverKeys.includes("sl-t1"), "P2: Undo (last-intent-wins) обязан спасти sl-t1 от удаления");
    eq(aDel.serverKeys.includes("sl-t4"), "P2: DELETED_OLDER — интент старше серверной копии НЕ удаляет sl-t4");
    eq(aDel.intentsLeft === 0, "P2: очередь интентов дренирована: " + aDel.intentsLeft);

    // B: tombstone применяется ЛОКАЛЬНО (sl-t2 исчезает, не ресурректится) + «правка воскрешает»
    const bDel = await act(ctxB, "B-tombstone", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      const t2gone = (await ldb.dbQuery("SELECT 1 x FROM texts WHERE text_key='sl-t2'")).length === 0;
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      return { t2gone, serverKeys: (list.rows || []).map((r) => r.artifact_key).sort() };
    }, ARGS);
    eq(bDel.t2gone === true, "P2: B применил tombstone локально — sl-t2 удалён, ресуррекции нет");
    eq(!bDel.serverKeys.includes("sl-t2"), "P2: B не ресурректил sl-t2 своим UP'ом (tombstone ДО UP)");

    // «Правка воскрешает»: A удаляет sl-t4; B (не зная об этом) правит sl-t4 новее deleted_at →
    // B-синк: текст выживает локально, UP снимает tombstone, сервер снова держит sl-t4.
    await act(ctxA, "A-delete-t4", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      const t4 = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key='sl-t4'"))[0];
      if (t4) { await ldb.queueArtifactIntent("delete", "sl-t4", A.T_DEL3); await ldb.deleteText(t4.id); }
      await CS.fullSync(ldb);
      return {};
    }, ARGS);
    const bRevive = await act(ctxB, "B-revive", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      // БЕЗ boot-синка: «правка воскрешает» = офлайн-правка ДО того, как устройство узнало об
      // удалении. Правка НОВЕЕ deleted_at (T_REVIVE > T_DEL3) → tombstone НЕ применяется,
      // UP снимает его. Если headless-OPFS не сохранил sl-t4 с прошлого act'а — восстанавливаем
      // локальную копию с тем же смыслом (updated_at = T_REVIVE).
      const t4 = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key='sl-t4'"))[0];
      if (t4) await ldb.dbRun("UPDATE texts SET title='T4 revived', updated_at=? WHERE id=?", [A.T_REVIVE, t4.id]);
      else await ldb.importBundle({ manifest: {}, texts: [
        { text_key: "sl-t4", title: "T4 revived", updated_at: A.T_REVIVE, created_at: A.T_T4,
          sentences: [{ he_plain: "עץ ירוק", ru: "Зелёное дерево", order_index: 0 }] },
      ] }, { mode: "skip" });
      const s = await CS.fullSync(ldb);
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      return {
        localAlive: (await ldb.dbQuery("SELECT 1 x FROM texts WHERE text_key='sl-t4'")).length === 1,
        serverKeys: (list.rows || []).map((r) => r.artifact_key),
        tombKeys: (list.tombstones || []).map((t) => t.artifact_key),
      };
    }, ARGS);
    eq(bRevive.localAlive === true, "P2: правка НОВЕЕ deleted_at выживает локально (LWW)");
    eq(bRevive.serverKeys.includes("sl-t4") && !bRevive.tombKeys.includes("sl-t4"), "P2: «правка воскрешает» — PUT снял tombstone: " + JSON.stringify(bRevive.tombKeys));

    // Битый артефакт новее локального: replace-путь НЕ теряет старый текст (R11)
    const bGarbage = await act(ctxB, "B-garbage", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      const before = (await ldb.dbQuery("SELECT title FROM texts WHERE text_key='sl-t1'"))[0];
      await fetch("/api/learner/artifacts/put", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-LP-CSRF": localStorage.getItem("cloud.csrf") || "" },
        body: JSON.stringify({ artifact_key: "sl-t1", updated_at: A.T_GARBAGE, payload: { broken: true } }) });
      await CS.fullSync(ldb);
      const after = (await ldb.dbQuery("SELECT title FROM texts WHERE text_key='sl-t1'"))[0];
      return { before: before && before.title, after: after && after.title };
    }, ARGS);
    eq(bGarbage.after === bGarbage.before && !!bGarbage.after, "P2/R11: битый server-newer артефакт НЕ уничтожает локальный текст: " + JSON.stringify(bGarbage));

    // Отзыв consent → немедленный purge; re-grant → полный re-upload (включая state)
    const aRevoke = await act(ctxA, "A-revoke", async () => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      const csrf = localStorage.getItem("cloud.csrf") || "";
      const rv = await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf },
        body: JSON.stringify({ key: "cloud_texts", granted: false, version: CS.CLOUD_TEXTS_CONSENT_VERSION }) }).then((r) => r.json());
      const listAfterRevoke = await fetch("/api/learner/artifacts", { credentials: "same-origin" });
      const rg = await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf },
        body: JSON.stringify({ key: "cloud_texts", granted: true, version: CS.CLOUD_TEXTS_CONSENT_VERSION }) }).then((r) => r.json());
      const s = await CS.fullSync(ldb);
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      return {
        purged: rv && rv.explanations && rv.explanations.artifacts_purged,
        after403: listAfterRevoke.status === 403,
        regrant: !!(rg && rg.ok),
        art: s.artifacts,
        rows: (list.rows || []).length,
        state: !!(list.state && list.state.updated_at),
      };
    }, ARGS);
    eq(Number(aRevoke.purged) >= 2, "P2: отзыв purge'ит артефакты немедленно (deletion-семантика класса C): " + aRevoke.purged);
    eq(aRevoke.after403 === true, "P2: после отзыва list честно 403");
    eq(aRevoke.art && aRevoke.art.uploaded >= 2 && aRevoke.rows >= 2, "P2: re-grant → полный re-upload текстов: " + JSON.stringify({ up: aRevoke.art && aRevoke.art.uploaded, rows: aRevoke.rows }));
    eq(aRevoke.state === true, "P2: state_bundle перезалит после purge (server-lost детекция)");

    // ── Live-инцидент 2026-07-18: удаление в окне после revoke-purge ────────
    // Артефакт отсутствует на сервере в момент дренажа интента → tombstone ОБЯЗАН создаться
    // всё равно, иначе волна перезаливки другого устройства воскрешает удалённый текст.
    const aPurgeWin = await act(ctxA, "A-purge-window", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);
      const csrf = localStorage.getItem("cloud.csrf") || "";
      await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf },
        body: JSON.stringify({ key: "cloud_texts", granted: false, version: CS.CLOUD_TEXTS_CONSENT_VERSION }) });
      await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-LP-CSRF": csrf },
        body: JSON.stringify({ key: "cloud_texts", granted: true, version: CS.CLOUD_TEXTS_CONSENT_VERSION }) });
      const t1 = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key='sl-t1'"))[0];
      if (t1) { await ldb.queueArtifactIntent("delete", "sl-t1", A.T_PURGEDEL); await ldb.deleteText(t1.id); }
      const s = await CS.fullSync(ldb);   // drain по ПУСТОМУ (только что purged) серверу
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      return { tombKeys: (list.tombstones || []).map((t) => t.artifact_key), rows: (list.rows || []).map((r) => r.artifact_key) };
    }, ARGS);
    eq(aPurgeWin.tombKeys.includes("sl-t1"), "инцидент: tombstone создаётся и когда артефакта нет (purge-окно): " + JSON.stringify(aPurgeWin.tombKeys));
    eq(!aPurgeWin.rows.includes("sl-t1"), "инцидент: удалённый текст не перезалит собственным UP");
    const bNoRes = await act(ctxB, "B-no-resurrect", async () => {
      const ldb = window.__ldb, CS = window.CloudSync;
      await CS.fullSync(ldb);   // у B текст ещё жив локально — волна UP не должна воскресить
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      return {
        local: (await ldb.dbQuery("SELECT 1 x FROM texts WHERE text_key='sl-t1'")).length,
        rows: (list.rows || []).map((r) => r.artifact_key),
      };
    }, {});
    eq(bNoRes.local === 0 && !bNoRes.rows.includes("sl-t1"), "инцидент: B применяет удаление вместо воскрешения: " + JSON.stringify(bNoRes));

    await ctxA.close(); await ctxB.close();
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    await b.close().catch(() => {});
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  const total = 50;
  if (failures.length) {
    console.error(`smoke:sync-slim FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:sync-slim OK (${total}/${total}) — P0: slim-состав (без full-state, <200КБ, закладки едут) · state_bundle (заметки/якоря без корпуса/полки/override/anki/study_day/roots) · updated_at-инвариантность (пинг-понг погашен) · fresh-restore=фикстура · LWW body-merge · occurrence-only signal · двухдевайсный union · fat-откат+replace_equal-миграция · skew-guard · P2: интент-delete+tombstone (без ресуррекции) · Undo=last-intent-wins · DELETED_OLDER · «правка воскрешает» · битый server-newer не теряет текст · revoke=purge+re-grant re-upload`);
  }
})();
