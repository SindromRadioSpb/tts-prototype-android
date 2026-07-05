#!/usr/bin/env node
"use strict";
// smoke:server-keying — гейт пре-условия CLG-P6 №2 (AI_MENTOR_RECON §7 «Границы item_key»,
// §15.7.2): серверный keying/resolver-стек (db/keyingService.js) выводит item_key для новых
// слов В ТОЧНОСТИ как браузерный стек.
//
// Независимость (feedback_independent_oracle_gate): parity меряется против reference-бандла
// build-notes-from-bundle (артефакт, который сервис не производил) — для каждой word_study
// заметки юнит восстанавливается из ЕЁ Dicta-токена (sentence_morph), прогоняется через
// СЕРВИС и итоговый item_key диффится с LC.noteKey(эталонного body). Порог: content ≥95%
// (потолок = pid-parity autogen-parity: офлайн inflect()-скорер vs index-lookup дрейф).
//
// Плюс: keyer-trio конформность · honesty (нерешаемое → null, гомограф → ambiguous+alts,
// function-word → pid) · idle-unload · e2e endpoint (401/CSRF/resolve/cap/status).
//
// Run: node scripts/premium/server-keying-smoke.js [--zip Library/test-enriched-lean.zip]
//      [--limit N] [--gate]

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const JSZip = require(path.join(REPO, "public", "db", "jszip.min.js"));
const NA = require(path.join(REPO, "public", "js", "notes-autogen.js"));
const LC = require(path.join(REPO, "public", "js", "lemma-canon.js"));
const svc = require(path.join(REPO, "db", "keyingService.js"));

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 ? (process.argv[i + 1] && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : true) : def; }
const ZIP_IN = path.resolve(REPO, String(arg("zip", "Library/test-enriched-lean.zip")));
const LIMIT = Number(arg("limit", 0)) || 0;
const GATE = !!arg("gate", false);
const PORT = 3296, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-keying-secret-0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[server-keying]", ...a);

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

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
async function api(method, p, { cookie, csrf, body } = {}) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json, res };
}

(async () => {
  // ── 1. Keyer-trio конформность (pure): NA.lemmaKey == LC.noteKey на shared-телах ──
  const trioBodies = [
    { word: "ספר", lemma: "ספר", pos: "noun", meaning: "книга" },
    { word: "התקדם", lemma: "התקדם", pos: "verb", binyan: "hitpael", pealim_id: "1234" },
    { word: "גם", lemma: "", pos: "adverb" },
  ];
  for (const b of trioBodies) {
    eq(NA.lemmaKey(b) === LC.noteKey(b), "trio: NA.lemmaKey != LC.noteKey for " + JSON.stringify(b));
  }
  eq(LC.noteKey({ word: "", lemma: "", pos: "noun" }) === "", "trio: unkeyable body must refuse ('')");

  // ── 2. Сервис: загрузка + honesty ─────────────────────────────────────────
  await svc.ensureLoaded();
  const st0 = svc.status();
  eq(st0.loaded === true, "service must report loaded after ensureLoaded");
  eq(st0.keyer_version === LC.KEYER_VERSION, "service keyer_version must equal LemmaCanon.KEYER_VERSION");
  log("dataset loaded in", st0.load_ms + "ms", "| model", st0.model_version);

  const rEmpty = await svc.resolveWord({ surface: "" });
  eq(rEmpty.keyable === false && rEmpty.item_key === null, "empty surface must be honestly unkeyable");
  const rOneLetter = await svc.resolveWord({ surface: "ם" });
  eq(rOneLetter.keyable === false && rOneLetter.item_key === null, "single-letter surface must be honestly unkeyable (dictaTokenToUnit mirror)");

  const rWord = await svc.resolveWord({ surface: "שלום" });
  eq(rWord.keyable === true && !!rWord.item_key, "plain content word must resolve to a key, got " + JSON.stringify(rWord.item_key));

  // function word → pid-ключ через function-links (зеркало Room _statusPid / оркестратора)
  const linksRaw = JSON.parse(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-function-links.v1.json"), "utf8"));
  const gam = (linksRaw.links || {})["גם"];
  if (gam && gam.id != null) {
    const rGam = await svc.resolveWord({ surface: "גם", pos: "adverb" });
    eq(rGam.item_key === "pid:" + String(gam.id), "function word גם must key by function-links pid, got " + JSON.stringify(rGam.item_key));
  } else {
    log("NOTE: גם not in function-links — pid assert skipped");
  }

  // гомограф: детерминированно находим огласованную ячейку с ≥2 pealim_id (content-POS)
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz"))).toString("utf8"));
  const maps = NA.buildResolverMaps(ds.paradigms);
  let homograph = null;
  const formKeys = Array.from(maps.formIdx.keys()).sort();
  for (const fk of formKeys) {
    const arr = maps.formIdx.get(fk) || [];
    const contentEntries = arr.filter((x) => /noun|adjective|verb/.test(x.pos || "") && x.pealim_id);
    const ids = new Set(contentEntries.map((x) => String(x.pealim_id)));
    if (ids.size >= 2 && NA.stripNiqqud(fk).length >= 2) { homograph = { form: fk, pos: contentEntries[0].pos }; break; }
  }
  eq(!!homograph, "dataset must contain at least one multi-pid vocalized cell (homograph probe)");
  if (homograph) {
    const rH = await svc.resolveWord({ surface: NA.stripNiqqud(homograph.form), niqqud: homograph.form, pos: homograph.pos });
    eq(rH.ambiguous === true && Array.isArray(rH.alts) && rH.alts.length >= 1,
      "homograph cell must resolve ambiguous:true with alts, got " + JSON.stringify({ form: homograph.form, ambiguous: rH.ambiguous, alts: (rH.alts || []).length }));
  }

  // ── 3. Bundle end-to-end parity: сервис-ключ == LC.noteKey(эталонного body) ──
  log("reference", path.relative(REPO, ZIP_IN));
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const advFile = zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json");
  if (!advFile) { console.error("no notes_advanced.json in zip"); process.exit(2); }
  const adv = JSON.parse(await advFile.async("string"));
  const refNotes = (adv.notes || []).filter((n) => n.note_type === "word_study");
  const sidTokens = new Map();
  for (const sm of (adv.sentence_morph || [])) sidTokens.set(String(sm.sentence_id), sm.tokens || []);
  const notes = LIMIT ? refNotes.slice(0, LIMIT) : refNotes;
  const CONTENT = new Set(["verb", "noun", "adjective"]);

  let content = 0, contentKeyMatch = 0, fnProper = 0, fnProperKeyMatch = 0, missingTok = 0, skipped = 0, nullKeys = 0;
  const mis = [];
  for (const note of notes) {
    let ref; try { ref = JSON.parse(note.body_json); } catch (_) { continue; }
    const tid = String(note.target_id || "");
    const ci = tid.lastIndexOf(":");
    const sid = ci >= 0 ? tid.slice(0, ci) : tid;
    const off = ci >= 0 ? Number(tid.slice(ci + 1)) : NaN;
    const toks = sidTokens.get(String(sid));
    if (!toks || !Number.isInteger(off) || !toks[off]) { missingTok++; continue; }
    const unit = NA.dictaTokenToUnit(toks[off]);
    if (!unit) { skipped++; continue; }
    const refKey = LC.noteKey(ref);
    if (!refKey) { skipped++; continue; }
    const got = await svc.resolveWord({ dicta_token: toks[off] });
    if (!got.item_key) nullKeys++;
    const match = got.item_key === refKey;
    if (CONTENT.has(unit.pos)) {
      content++;
      if (match) contentKeyMatch++;
      else if (mis.length < 25) mis.push({ word: ref.word, pos: unit.pos, got: got.item_key, want: refKey, ch: got.channel });
    } else {
      fnProper++;
      if (match) fnProperKeyMatch++;
    }
  }
  const pct = (n, d) => d ? (Math.round(1000 * n / d) / 10) + "%" : "n/a";
  log("─────────────────────────────────────────────");
  log("content notes:", content, "| key match:", contentKeyMatch, "(" + pct(contentKeyMatch, content) + ")");
  log("function/proper notes:", fnProper, "| key match:", fnProperKeyMatch, "(" + pct(fnProperKeyMatch, fnProper) + ") [informational: клиент слоит function-links профиль, которого нет в офлайн-эталоне]");
  log("missing token:", missingTok, "| skipped:", skipped, "| null keys:", nullKeys);
  if (mis.length) { log("─ content key mismatches (sample) ─"); mis.forEach((m) => log("  ", JSON.stringify(m))); }
  const keyRate = content ? contentKeyMatch / content : 0;
  eq(content > 100, "reference bundle must yield >100 comparable content notes, got " + content);
  eq(keyRate >= 0.95, "content item_key parity must be ≥95%, got " + pct(contentKeyMatch, content));

  // ── 4. Idle-unload / reload ────────────────────────────────────────────────
  eq(svc.unloadNow() === true, "unloadNow must report an unload");
  eq(svc.status().loaded === false, "service must report unloaded after unloadNow");
  const rAfter = await svc.resolveWord({ surface: "שלום" });
  eq(rAfter.keyable === true && rAfter.item_key === rWord.item_key, "reload after unload must reproduce the same key");

  // ── 5. e2e endpoint: 401 / CSRF / resolve / cap / status ──────────────────
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-keying-smoke-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan :" + PORT + ")\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    const un1 = await api("GET", "/api/learner/keying/status", {});
    eq(un1.status === 401, "keying/status without session must be 401, got " + un1.status);
    const un2 = await api("POST", "/api/learner/keying/resolve", { body: { words: [{ surface: "שלום" }] } });
    eq(un2.status === 401, "keying/resolve without session must be 401, got " + un2.status);

    const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "keying-smoke" } });
    eq(li.status === 200 && li.json.ok, "login failed");
    const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
    const cookie = String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0];
    const csrf = li.json.csrf;

    const noCsrf = await api("POST", "/api/learner/keying/resolve", { cookie, body: { words: [{ surface: "שלום" }] } });
    eq(noCsrf.status === 403, "resolve without CSRF must be 403, got " + noCsrf.status);

    const ok1 = await api("POST", "/api/learner/keying/resolve", { cookie, csrf, body: { words: [{ surface: "שלום" }, { surface: "ם" }] } });
    eq(ok1.status === 200 && ok1.json.ok && ok1.json.keyer_version === LC.KEYER_VERSION, "resolve must succeed with keyer_version, got " + JSON.stringify(ok1.json && { s: ok1.status, kv: ok1.json.keyer_version }));
    eq(ok1.json.results && ok1.json.results.length === 2 && !!ok1.json.results[0].item_key && ok1.json.results[1].keyable === false,
      "resolve results must be per-word honest (key + unkeyable), got " + JSON.stringify(ok1.json.results && ok1.json.results.map((r) => r.item_key)));
    eq(ok1.json.results[0].item_key === rWord.item_key, "endpoint key must equal in-process service key (same stack)");

    const cap = await api("POST", "/api/learner/keying/resolve", { cookie, csrf, body: { words: Array.from({ length: 51 }, () => ({ surface: "שלום" })) } });
    eq(cap.status === 400 && cap.json && cap.json.error === "TOO_MANY_WORDS", "51 words must be 400 TOO_MANY_WORDS, got " + cap.status);

    const stE = await api("GET", "/api/learner/keying/status", { cookie });
    eq(stE.status === 200 && stE.json.ok && stE.json.loaded === true, "keying/status must report loaded after a resolve");
  } catch (e) {
    failures.push("CRASH: " + ((e && e.stack) || e));
  } finally {
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const total = 24;
  if (failures.length) {
    console.error(`smoke:server-keying FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:server-keying OK (${total}/${total}) — CLG-P6 prep №2: trio-конформность · honesty (unkeyable/homograph/function-pid) · bundle key-parity ${pct(contentKeyMatch, content)} (≥95%) · idle-unload/reload · e2e endpoint (401/CSRF/resolve/cap/status)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
