#!/usr/bin/env node
"use strict";
// smoke:artifact-sync — CLG-P5.5 gate (AI_MENTOR_RECON §5/§9): класс-B синк «Моих текстов».
//   • consent server-enforced: без галочки — 403 на list И artifacts.skipped='no_consent';
//   • UP: собственный текст уезжает (бандл exportBundle({textIds})), КОРПУСНЫЙ — никогда;
//   • DOWN (second device): текст материализуется через importBundle (title/предложения целы);
//   • LWW: правка на B (updated_at новее) → сервер обновлён → A получает новую версию
//     (delete+reimport), старая копия никогда не перетирает новую;
//   • recon-гейт CLG-P5.5: «sentence_id из push/агента резолвится в тот же текст» —
//     здесь его материальная база: text_key+order_index идентичны на обоих устройствах.
// Run: node scripts/premium/artifact-sync-smoke.js   (or npm run smoke:artifact-sync)

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3288, BASE = "http://127.0.0.1:" + PORT;
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
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-artifact-smoke-"));
  const srv = startServer(scratch);
  const b = await pw.chromium.launch();
  const NOW = Date.now();
  const ARGS = { SECRET, T_EDIT: new Date(NOW + 60000).toISOString() };   // precomputed (act-retry safe)

  const mkDevice = async () => b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
  const openOn = async (ctx, label) => {
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
    for (let i = 0; i < tries; i++) {
      const { pg, errs, healthy } = await openOn(ctx, label + (i ? "#" + i : ""));
      if (!healthy) { await pg.close().catch(() => {}); await sleep(600); continue; }
      let res = null;
      try { res = await pg.evaluate(fn, args); } catch (e) { res = { __crash: String(e) }; }
      const alive = await pg.evaluate(async () => { try { const r = await window.__ldb.dbQuery("SELECT 1 AS x"); return !!(r && r[0]); } catch (_) { return false; } }).catch(() => false);
      if (alive && !errs.some((e) => e.includes("memory access out of bounds")) && res && !res.__crash) { await pg.close().catch(() => {}); return res; }
      await pg.close().catch(() => {});
      await sleep(600);
    }
    throw new Error("act[" + label + "] failed every attempt");
  };

  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan)\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const ctxA = await mkDevice(), ctxB = await mkDevice();

    // A: no-consent honesty → grant → own text up, corpus text stays home.
    // Все ассерты STATE-based (retry акта не должен их ломать: consent/upload персистентны).
    const aRes = await act(ctxA, "A", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      const out = {};
      out.login = (await CS.login(A.SECRET, "art-A")).ok === true;
      // fixture: own text + corpus-marked text (importBundle shape C)
      await ldb.importBundle({ manifest: {}, texts: [
        { text_key: "own-1", title: "Мой текст", sentences: [{ he_plain: "שלום עולם", ru: "Привет мир", order_index: 0 }] },
        { text_key: "corp-1", title: "Корпусный", source_meta_json: JSON.stringify({ corpus: { id: "x" } }), sentences: [{ he_plain: "בית", ru: "дом", order_index: 0 }] },
      ] }, { mode: "skip" });
      // consent-состояние СЕЙЧАС (retry мог уже дать согласие) — no-consent ветка проверяется
      // только пока согласия реально нет
      const me0 = await CS.me();
      const consented0 = !!(me0 && me0.consents && me0.consents.cloud_texts && me0.consents.cloud_texts.granted);
      if (!consented0) {
        const s0 = await CS.fullSync(ldb);
        out.noConsentSkip = !!(s0.artifacts && s0.artifacts.skipped === "no_consent");
        out.noConsent403 = (await fetch("/api/learner/artifacts", { credentials: "same-origin" })).status === 403;
      } else { out.noConsentSkip = "n/a-retry"; out.noConsent403 = "n/a-retry"; }
      const cs = await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-LP-CSRF": localStorage.getItem("cloud.csrf") || "" },
        // P1: версия карты — из константы CloudSync (v1-грант синк честно приостанавливает)
        body: JSON.stringify({ key: "cloud_texts", granted: true, version: CS.CLOUD_TEXTS_CONSENT_VERSION }) }).then((r) => r.json());
      out.consent = !!(cs && cs.ok);
      const s1 = await CS.fullSync(ldb);
      out.art1 = s1.artifacts;
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      out.serverKeys = (list.rows || []).map((r) => r.artifact_key).sort();
      return out;
    }, ARGS);
    eq(aRes.login, "A: login failed");
    eq(aRes.noConsentSkip === true || aRes.noConsentSkip === "n/a-retry", "A: без consent движок обязан скипнуть артефакты");
    eq(aRes.noConsent403 === true || aRes.noConsent403 === "n/a-retry", "A: без consent сервер обязан 403");
    eq(aRes.consent, "A: consent grant failed");
    eq(aRes.art1 && aRes.art1.ok && (aRes.art1.uploaded === 1 || aRes.art1.upSkipped >= 1),
      "A: свой текст должен быть на сервере (uploaded либо уже там): " + JSON.stringify(aRes.art1));
    eq(JSON.stringify(aRes.serverKeys) === JSON.stringify(["own-1"]), "КОРПУСНЫЙ ТЕКСТ УТЁК (или own не уехал): " + JSON.stringify(aRes.serverKeys));

    // B: fresh device → text materializes; then edits → LWW newer up
    const bRes = await act(ctxB, "B", async (A) => {
      const ldb = window.__ldb, CS = window.CloudSync;
      const out = {};
      out.login = (await CS.login(A.SECRET, "art-B")).ok === true;
      const s = await CS.fullSync(ldb);
      out.art = s.artifacts;
      const t = await ldb.dbQuery("SELECT id, title, updated_at FROM texts WHERE text_key = 'own-1'");
      out.gotText = !!(t && t[0] && t[0].title === "Мой текст");
      const sc = t && t[0] ? await ldb.dbQuery("SELECT COUNT(*) c FROM sentences WHERE text_id = ?", [t[0].id]) : null;
      out.sentences = sc && sc[0] ? Number(sc[0].c) : 0;
      // правка на B: title + updated_at строго новее (precomputed — retry-safe)
      if (t && t[0]) await ldb.dbRun("UPDATE texts SET title = 'Edited on B', updated_at = ? WHERE id = ?", [A.T_EDIT, t[0].id]);
      const s2 = await CS.fullSync(ldb);
      out.art2 = s2.artifacts;
      return out;
    }, ARGS);
    eq(bRes.login, "B: login failed");
    eq(bRes.gotText && bRes.sentences === 1, "B: текст должен материализоваться с целым содержимым: " + JSON.stringify(bRes.art));
    eq(bRes.art2 && bRes.art2.ok && (bRes.art2.uploaded === 1 || bRes.art2.upSkipped >= 1),
      "B: правка (LWW новее) должна уехать: " + JSON.stringify(bRes.art2));

    // A: pulls the newer version (delete+reimport); older copy must never win
    const aRes2 = await act(ctxA, "A2", async () => {
      const ldb = window.__ldb, CS = window.CloudSync;
      const s = await CS.fullSync(ldb);
      const t = await ldb.dbQuery("SELECT title FROM texts WHERE text_key = 'own-1'");
      const list = await fetch("/api/learner/artifacts", { credentials: "same-origin" }).then((r) => r.json());
      return { art: s.artifacts, title: t && t[0] && t[0].title, serverCount: (list.rows || []).length };
    }, {});
    eq(aRes2.title === "Edited on B", "A: заголовок должен стать новым — LWW-обновление применено (got " + aRes2.title + " art=" + JSON.stringify(aRes2.art) + ")");
    eq(aRes2.serverCount === 1, "server must still hold exactly 1 artifact");

    await ctxA.close(); await ctxB.close();
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    await b.close().catch(() => {});
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  const total = 11;
  if (failures.length) {
    console.error(`smoke:artifact-sync FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:artifact-sync OK (${total}/${total}) — CLG-P5.5: consent server-enforced (403+skip) · own-текст уехал, КОРПУСНЫЙ нет · fresh-device материализация (importBundle) · LWW-правка B→сервер→A (delete+reimport) · сервер держит ровно 1 артефакт`);
  }
})();
