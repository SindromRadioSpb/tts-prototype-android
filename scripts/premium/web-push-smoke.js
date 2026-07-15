#!/usr/bin/env node
"use strict";
// smoke:web-push — CLG-P4.5 gate (AI_MENTOR_RECON §8/§9 P4.5). Реальный web-push протокол против
// ФЕЙКОВОГО push-сервиса (локальный http, настоящие ECDH P-256 ключи подписки → web-push честно
// шифрует aes128gcm, мы ассертим заголовки VAPID/TTL и приход запроса):
//   • подписка сохраняется (status.count), vapid-key стабилен и раздаётся;
//   • /api/push/test → фейк-сервис ПОЛУЧИЛ пуш (Authorization vapid t=..., TTL, aes128gcm);
//   • honest count: due=0 у свежего юзера → sweep quiet (нудж НЕ уходит без due);
//   • sweep: due>0 → нудж ушёл; повторный sweep в тот же день → СУТОЧНЫЙ ДЕДУП (0 новых);
//     следующий день → снова уходит; не-тот-час без force → skipped;
//   • 410 от сервиса → подписка удаляется (не копим трупы).
// Run: node scripts/premium/web-push-smoke.js   (or npm run smoke:web-push)

const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3287, BASE = "http://127.0.0.1:" + PORT;
const PUSH_PORT = 3286;
const SECRET = "smoke-bootstrap-secret-0123456789abcdef";
const ADMIN = "smoke-admin-token-0123456789";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(dataDir) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    // NODE_TLS_REJECT_UNAUTHORIZED=0 — ТОЛЬКО для этого child-теста: web-push всегда ходит
    // по TLS, а фейковый push-сервис живёт на self-signed фикстурном сертификате.
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET, RESEARCH_ADMIN_TOKEN: ADMIN,
      NODE_TLS_REJECT_UNAUTHORIZED: "0", NUDGE_CHANNEL_SELECTOR_ENABLED: "0" },
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
async function api(method, p, { cookie, csrf, admin, body } = {}) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  if (admin) h["X-Admin-Token"] = admin;
  const res = await fetch(BASE + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json, res };
}
const b64u = (buf) => Buffer.from(buf).toString("base64url");

(async () => {
  const failures = []; let _ne = 0; const eq = (c, m) => { _ne++; if (!c) failures.push(m); };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-push-smoke-"));
  const openDb = () => { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db")); };
  const dbRun = (db, sql, p) => new Promise((res, rej) => db.run(sql, p || [], function (e) { (e ? rej(e) : res(this)); }));
  const dbAll = (db, sql, p) => new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r || []))));
  const withDb = async (fn) => { const db = openDb(); try { return await fn(db); } finally { await new Promise((r) => db.close(() => r())); } };
  const srv = startServer(scratch);

  // fake push service (HTTPS — web-push refuses plain http). Self-signed cert генерируется
  // В РАНТАЙМЕ в .tmp (gitignored): ключи, даже тестовые, в ПУБЛИЧНЫЙ репозиторий не коммитим
  // (secret-scanner noise + плохой прецедент). openssl берём с PATH либо из git-поставки.
  const certDir = path.join(REPO, ".tmp", "push-smoke-cert");
  const keyPath = path.join(certDir, "selfsigned.key.pem"), crtPath = path.join(certDir, "selfsigned.crt.pem");
  if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
    fs.mkdirSync(certDir, { recursive: true });
    const args = ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath, "-out", crtPath,
      "-days", "3650", "-nodes", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"];
    let r = spawnSync("openssl", args, { stdio: "ignore" });
    if (r.status !== 0) r = spawnSync("C:\\Program Files\\Git\\usr\\bin\\openssl.exe", args, { stdio: "ignore" });
    if (r.status !== 0 || !fs.existsSync(keyPath)) { console.error("no openssl available to mint the test cert"); process.exit(1); }
  }
  const received = [];
  let respond410 = false;
  const fakeSvc = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(crtPath),
  }, (req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ url: req.url, auth: req.headers.authorization || "", ttl: req.headers.ttl || "", enc: req.headers["content-encoding"] || "", bytes: Buffer.concat(chunks).length });
      res.statusCode = respond410 ? 410 : 201;
      res.end();
    });
  });
  await new Promise((r) => fakeSvc.listen(PUSH_PORT, "127.0.0.1", r));

  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan)\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "push-smoke" } });
    eq(li.status === 200 && li.json.ok, "login failed");
    const sc = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
    const cookie = String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0];
    const csrf = li.json.csrf;

    // vapid key: served + stable across calls
    const vk1 = await api("GET", "/api/push/vapid-key", { cookie });
    const vk2 = await api("GET", "/api/push/vapid-key", { cookie });
    eq(vk1.status === 200 && vk1.json.ok && typeof vk1.json.key === "string" && vk1.json.key.length > 40, "vapid-key not served");
    eq(vk1.json.key === vk2.json.key, "vapid key must be STABLE (subscriptions bind to it)");

    // subscription with REAL ECDH P-256 keys (web-push must encrypt successfully)
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const subscription = {
      endpoint: "https://127.0.0.1:" + PUSH_PORT + "/push/abc123",
      keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(crypto.randomBytes(16)) },
    };
    const subRes = await api("POST", "/api/push/subscribe", { cookie, csrf, body: { subscription } });
    eq(subRes.status === 200 && subRes.json.ok, "subscribe failed: " + JSON.stringify(subRes.json));
    const st1 = await api("GET", "/api/push/status", { cookie });
    eq(st1.json && st1.json.count === 1, "status.count must be 1");

    // honest-count precondition: fresh user has due=0 → sweep must stay QUIET
    const q0 = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { force: true } });
    eq(q0.status === 200 && q0.json.ok && q0.json.notified === 0 && q0.json.quiet === 1 && received.length === 0,
      "sweep must NOT nudge a user with 0 due: " + JSON.stringify(q0.json));

    // give the user a due word (seed + Again 30 days back → due now)
    const T0 = Date.now() - 30 * 86400000;
    const ing = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "push-due-1", schema_version: 1, keyer_version: 1,
      review_log: [
        { id: "seed:שלום#noun#push00000001", item_key: "שלום#noun", kind: "seed", reviewed_at: new Date(T0 - 86400000).toISOString(), grade: null, source: "seed-sm2", meta_json: JSON.stringify({ interval: 3, reps: 1, lapses: 0 }) },
        { id: "app:push-r1", item_key: "שלום#noun", kind: "review", reviewed_at: new Date(T0).toISOString(), grade: 1, source: "room-recall", meta_json: "{}" },
      ],
    } });
    eq(ing.status === 200 && ing.json.review_log.new === 2, "due fixture ingest failed");

    // test-send → fake service receives a REAL encrypted webpush request
    const t1 = await api("POST", "/api/push/test", { cookie, csrf, body: {} });
    eq(t1.status === 200 && t1.json.ok && t1.json.sent === 1 && t1.json.due === 1, "push test failed: " + JSON.stringify(t1.json));
    eq(received.length === 1 && /vapid t=/.test(received[0].auth) && Number(received[0].ttl) > 0 &&
       received[0].enc === "aes128gcm" && received[0].bytes > 0 && received[0].url === "/push/abc123",
      "fake service must receive a VAPID-signed aes128gcm push: " + JSON.stringify(received[0]));

    // daily sweep: due>0 → notified; SAME day again → deduped; next day → notified again
    const NOWH = Date.UTC(2026, 6, 10, 6, 0, 0);   // 06:00 UTC = PUSH_HOUR_UTC default
    const s1 = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { now: NOWH } });
    eq(s1.json && s1.json.notified === 1, "sweep at the hour must nudge: " + JSON.stringify(s1.json));
    const s2 = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { now: NOWH + 3600000 } });
    eq(s2.json && s2.json.skipped === "not_the_hour", "off-hour sweep must skip: " + JSON.stringify(s2.json));
    const s2b = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { now: NOWH + 600000 } });   // тот же час, тот же день
    eq(s2b.json && s2b.json.notified === 0 && s2b.json.skippedDay >= 1, "same-hour same-day must be deduped: " + JSON.stringify(s2b.json));
    const s3 = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { now: NOWH + 86400000 } });
    eq(s3.json && s3.json.notified === 1, "next day must nudge again: " + JSON.stringify(s3.json));
    eq(received.length === 3, "fake service must have exactly 3 pushes (test + hour + next-day), got " + received.length);

    // ── P7.3a cross-channel budget (push side, LIVE): push claims the shared nudge_ledger by LOCAL day ──
    const uid = li.json.user.id;
    const led = await withDb((db) => dbAll(db, `SELECT * FROM nudge_ledger WHERE user_id=? AND channel='push'`, [uid]));
    eq(led.length >= 1 && led.some((r) => r.local_day === "2026-07-10"), "push sweep CLAIMED shared ledger (channel=push, local_day) — real cross-channel arbiter, not faked");

    // Telegram уже занял local_day (2026-07-14) → push sweep того же дня SKIPs budget (обратное направление)
    const D14 = Date.UTC(2026, 6, 14, 6, 0, 0);
    await withDb((db) => dbRun(db, `INSERT INTO nudge_ledger (user_id, local_day, channel, reason) VALUES (?, '2026-07-14', 'telegram', 'DUE_READY')`, [uid]));
    const recvBefore = received.length;
    const sTG = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { now: D14 } });
    eq(sTG.json && sTG.json.notified === 0 && sTG.json.budget >= 1, "Telegram claim блокирует push (cross-channel единый бюджет): " + JSON.stringify(sTG.json));
    eq(received.length === recvBefore, "push НЕ отправлен (день занят Telegram) — ноль новых пушей");

    // prefs.enabled=0 (глобальный opt-out) гасит и push (не только Telegram)
    await withDb((db) => dbRun(db, `INSERT INTO notification_preferences (user_id, enabled, telegram_enabled, timezone) VALUES (?,0,1,'Asia/Jerusalem') ON CONFLICT(user_id) DO UPDATE SET enabled=0`, [uid]));
    const D15 = Date.UTC(2026, 6, 15, 6, 0, 0);
    const sOff = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { now: D15 } });
    eq(sOff.json && sOff.json.notified === 0 && sOff.json.disabled >= 1, "prefs.enabled=0 гасит push (глобальный opt-out кросс-канальный): " + JSON.stringify(sOff.json));
    await withDb((db) => dbRun(db, `UPDATE notification_preferences SET enabled=1 WHERE user_id=?`, [uid]));

    // P7.3c: muted_until (/notoday//mute = КРОСС-КАНАЛЬНАЯ тишина) гасит и push — не только Telegram
    await withDb((db) => dbRun(db, `UPDATE notification_preferences SET muted_until='2027-06-01T00:00:00.000Z' WHERE user_id=?`, [uid]));
    const D16 = Date.UTC(2026, 6, 16, 6, 0, 0);
    const sMute = await api("POST", "/api/push/sweep", { admin: ADMIN, body: { now: D16 } });
    eq(sMute.json && sMute.json.notified === 0 && sMute.json.muted >= 1, "muted_until (/mute//notoday) гасит push кросс-канально (не только Telegram): " + JSON.stringify(sMute.json));
    await withDb((db) => dbRun(db, `UPDATE notification_preferences SET muted_until=NULL WHERE user_id=?`, [uid]));

    // 410 → subscription removed
    respond410 = true;
    const t2 = await api("POST", "/api/push/test", { cookie, csrf, body: {} });
    eq(t2.json && t2.json.removed === 1, "410 must remove the dead subscription: " + JSON.stringify(t2.json));
    const st2 = await api("GET", "/api/push/status", { cookie });
    eq(st2.json && st2.json.count === 0, "status.count must be 0 after 410 cleanup");
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    await stop(srv.c);
    await new Promise((r) => fakeSvc.close(() => r()));
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  const total = _ne;
  if (failures.length) {
    console.error(`smoke:web-push FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:web-push OK (${total}/${total}) — CLG-P4.5: vapid стабилен · подписка · honest quiet при due=0 · реальный aes128gcm+VAPID пуш дошёл · sweep час/суточный дедуп/след. день · 410-очистка · P7.3a: push claim'ит общий nudge_ledger · Telegram claim блокирует push · prefs.enabled=0 гасит push`);
  }
})();
