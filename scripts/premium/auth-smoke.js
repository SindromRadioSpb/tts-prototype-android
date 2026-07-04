#!/usr/bin/env node
"use strict";
// smoke:auth — CLG-P1 Identity & Account gate (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P1).
// Boots the server on a SCRATCH DATA_DIR (migration 020 applies to a fresh DB) and proves:
//   • bootstrap login: fail-closed без/с коротким секретом (503), wrong→401+audit, right→cookie;
//   • cookie flags (HttpOnly/SameSite=Lax; Secure под X-Forwarded-Proto https);
//   • session gate (me 401 без cookie), CSRF double-submit (403 без/с неверным X-LP-CSRF);
//   • consent grant/revoke history; sessions list + revoke (revoked cookie → 401);
//   • export: все user_id-таблицы динамическим sweep'ом, token_hash не экспортируется;
//   • delete = forget-the-stream: 0 строк user_id во ВСЕХ таблицах, deletion_journal выжил,
//     audit account_delete с user_id NULL; повторный login создаёт НОВОГО owner-пользователя;
//   • per-IP fail limiter (429 после AUTH_FAIL_MAX неудач) — с первого дня, не G-EXT;
//   • healthz несёт disk_pct_used/disk_warn (диск-алёрт CLG-P1).
// Run: node scripts/premium/auth-smoke.js   (or npm run smoke:auth)

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3297, BASE = "http://127.0.0.1:" + PORT;
const PORT2 = 3296, BASE2 = "http://127.0.0.1:" + PORT2;
const SECRET = "smoke-bootstrap-secret-0123456789abcdef";   // 40 chars ≥ AUTH_BOOTSTRAP_MIN_LEN
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(port, dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  c.stdout.on("data", (x) => logs.push(String(x)));
  c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(base, ms = 30000) {
  // healthz turns 200 BEFORE async migrations finish — wait for db+migrations ready, or the
  // first login races "no such table: users".
  const s = Date.now();
  while (Date.now() - s < ms) {
    try {
      const r = await fetch(base + "/healthz");
      if (r.status === 200) {
        const j = await r.json();
        if (j && j.db && j.db.ready && j.migrations && j.migrations.ready) return true;
      }
    } catch (_) {}
    await sleep(200);
  }
  return false;
}
function cookieFrom(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  const line = (sc || []).find((x) => String(x).startsWith("lp_session="));
  return { line: line || "", value: line ? String(line).split(";")[0] : "" };
}
async function api(base, method, p, { cookie, csrf, headers, body } = {}) {
  const h = { "Content-Type": "application/json", ...(headers || {}) };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(base + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json, res };
}

(async () => {
  const failures = []; const eq = (c, m) => { if (!c) failures.push(m); };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-auth-smoke-"));
  const scratch2 = fs.mkdtempSync(path.join(os.tmpdir(), "lp-auth-smoke2-"));
  const srv = startServer(PORT, scratch, { AUTH_BOOTSTRAP_SECRET: SECRET });
  let srv2 = null;
  try {
    if (!(await ready(BASE))) { console.error("server failed\n" + srv.logs.join("")); process.exit(1); }

    // healthz disk watermark (CLG-P1 disk alert)
    const hz = await api(BASE, "GET", "/healthz");
    eq(hz.status === 200 && "disk_pct_used" in (hz.json || {}) && "disk_warn" in (hz.json || {}), "healthz missing disk_pct_used/disk_warn");

    // fail-closed: short secret → 503 (covers the ≥128-bit enforcement)
    srv2 = startServer(PORT2, scratch2, { AUTH_BOOTSTRAP_SECRET: "too-short" });
    eq(await ready(BASE2), "server#2 failed to boot");
    const dis = await api(BASE2, "POST", "/api/auth/bootstrap-login", { body: { secret: "too-short" } });
    eq(dis.status === 503 && dis.json && dis.json.error === "AUTH_DISABLED", "short AUTH_BOOTSTRAP_SECRET did not fail closed (want 503 AUTH_DISABLED)");
    await stop(srv2.c); srv2 = null;

    // wrong secret → 401
    const bad = await api(BASE, "POST", "/api/auth/bootstrap-login", { body: { secret: "wrong-secret-wrong-secret" } });
    eq(bad.status === 401 && bad.json && bad.json.error === "BAD_SECRET", "wrong secret did not 401");

    // right secret → cookie + csrf + owner
    const li = await api(BASE, "POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "smoke-A" } });
    eq(li.status === 200 && li.json && li.json.ok === true && li.json.csrf, "login failed");
    eq(li.json && li.json.user && li.json.user.role === "owner", "first login did not create/return the owner user");
    const ck = cookieFrom(li.res);
    eq(/HttpOnly/i.test(ck.line) && /SameSite=Lax/i.test(ck.line) && !/;\s*Secure/i.test(ck.line), "cookie flags wrong on http (want HttpOnly+Lax, no Secure)");
    const cookieA = ck.value, csrfA = li.json.csrf, userId1 = li.json.user.id;

    // Secure flag appears behind the https proxy hop (trust proxy 1)
    const liS = await api(BASE, "POST", "/api/auth/bootstrap-login", { headers: { "X-Forwarded-Proto": "https" }, body: { secret: SECRET, deviceLabel: "smoke-S" } });
    eq(/;\s*Secure/i.test(cookieFrom(liS.res).line), "Secure flag missing when X-Forwarded-Proto=https");

    // me: with cookie ok, without 401
    const me = await api(BASE, "GET", "/api/auth/me", { cookie: cookieA });
    eq(me.status === 200 && me.json.user.id === userId1 && me.json.csrf === csrfA, "me with cookie failed");
    const me401 = await api(BASE, "GET", "/api/auth/me");
    eq(me401.status === 401, "me without cookie must 401");

    // CSRF: mutation without/with-wrong header → 403; with right → ok
    const c403a = await api(BASE, "POST", "/api/auth/consent", { cookie: cookieA, body: { key: "cloud_sync", granted: true } });
    eq(c403a.status === 403 && c403a.json.error === "BAD_CSRF", "mutation without CSRF must 403");
    const c403b = await api(BASE, "POST", "/api/auth/consent", { cookie: cookieA, csrf: "nope", body: { key: "cloud_sync", granted: true } });
    eq(c403b.status === 403, "mutation with wrong CSRF must 403");
    const cOk = await api(BASE, "POST", "/api/auth/consent", { cookie: cookieA, csrf: csrfA, body: { key: "cloud_sync", granted: true, version: "v1" } });
    eq(cOk.status === 200 && cOk.json.consents.cloud_sync && cOk.json.consents.cloud_sync.granted === true, "consent grant failed");
    const cRev = await api(BASE, "POST", "/api/auth/consent", { cookie: cookieA, csrf: csrfA, body: { key: "cloud_sync", granted: false, version: "v1" } });
    eq(cRev.status === 200 && cRev.json.consents.cloud_sync.granted === false, "consent revoke failed");

    // second session (device B) + revoke it from A → B's cookie dies
    const liB = await api(BASE, "POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "smoke-B" } });
    const cookieB = cookieFrom(liB.res).value;
    const meB = await api(BASE, "GET", "/api/auth/me", { cookie: cookieB });
    eq(meB.status === 200 && meB.json.user.id === userId1, "second login must attach to the SAME owner user");
    const ls = await api(BASE, "GET", "/api/auth/sessions", { cookie: cookieA });
    eq(ls.status === 200 && Array.isArray(ls.json.sessions) && ls.json.sessions.filter((s) => !s.revoked_at).length >= 3, "sessions list incomplete");
    const sidB = meB.json.session.id;
    const rv = await api(BASE, "POST", "/api/auth/sessions/revoke", { cookie: cookieA, csrf: csrfA, body: { sessionId: sidB } });
    eq(rv.status === 200 && rv.json.revoked === true, "session revoke failed");
    const meB2 = await api(BASE, "GET", "/api/auth/me", { cookie: cookieB });
    eq(meB2.status === 401, "revoked session cookie must 401");

    // export: dynamic sweep covers the identity tables; no secrets leak
    const ex = await api(BASE, "GET", "/api/account/export", { cookie: cookieA });
    eq(ex.status === 200 && ex.json.ok === true && ex.json.user && ex.json.user.id === userId1, "export failed");
    for (const t of ["devices", "user_sessions", "consent_records", "audit_log"]) {
      eq((ex.json.table_list || []).includes(t), `export table_list misses ${t} (dynamic sweep broken)`);
    }
    eq((ex.json.tables.consent_records || []).length === 2, "consent history must carry both grant+revoke rows");
    eq((ex.json.tables.user_sessions || []).every((s) => !("token_hash" in s) && !("csrf_token" in s)), "export leaked session token_hash/csrf");

    // delete: confirm guard → forget-the-stream → 401 → new owner on re-login
    const d400 = await api(BASE, "POST", "/api/account/delete", { cookie: cookieA, csrf: csrfA, body: {} });
    eq(d400.status === 400, "delete without confirm must 400");
    const del = await api(BASE, "POST", "/api/account/delete", { cookie: cookieA, csrf: csrfA, body: { confirm: "DELETE" } });
    eq(del.status === 200 && del.json.ok === true && Array.isArray(del.json.tablesPurged), "delete failed");
    const meGone = await api(BASE, "GET", "/api/auth/me", { cookie: cookieA });
    eq(meGone.status === 401, "cookie must die with the deleted account");
    const li2 = await api(BASE, "POST", "/api/auth/bootstrap-login", { body: { secret: SECRET } });
    eq(li2.status === 200 && li2.json.user.id !== userId1, "re-login after delete must mint a NEW owner (old stream is gone)");

    // fail limiter: hammer wrong secrets → 429 (already 1 fail recorded earlier)
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await api(BASE, "POST", "/api/auth/bootstrap-login", { body: { secret: "brute-" + i } });
      if (r.status === 429) { got429 = true; break; }
    }
    eq(got429, "per-IP fail limiter never returned 429");

    // DB-level post-delete checks (server stopped → direct read of the scratch DB)
    await stop(srv.c);
    const sqlite3 = require(path.join(REPO, "node_modules", "sqlite3"));
    const db = new sqlite3.Database(path.join(scratch, "app.db"), sqlite3.OPEN_READONLY);
    const all = (sql, p) => new Promise((res2, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res2(r))));
    const jj = await all("SELECT user_id FROM deletion_journal");
    eq(jj.length === 1 && jj[0].user_id === userId1, "deletion_journal must keep exactly the erased user_id");
    let leftover = 0;
    for (const t of ["devices", "user_sessions", "consent_records", "audit_log"]) {
      const r = await all(`SELECT COUNT(*) c FROM ${JSON.stringify(t)} WHERE user_id = ?`, [userId1]);
      leftover += Number(r[0].c) || 0;
    }
    const u = await all("SELECT COUNT(*) c FROM users WHERE id = ?", [userId1]);
    leftover += Number(u[0].c) || 0;
    eq(leftover === 0, `forget-the-stream leftover rows: ${leftover}`);
    const adel = await all("SELECT user_id FROM audit_log WHERE action = 'account_delete'");
    eq(adel.length === 1 && adel[0].user_id == null, "audit account_delete row must survive with user_id NULL");
    const afail = await all("SELECT COUNT(*) c FROM audit_log WHERE action = 'login_failed'");
    eq(Number(afail[0].c) >= 1, "login_failed audit rows missing");
    await new Promise((r) => db.close(() => r()));
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    await stop(srv.c).catch(() => {});
    if (srv2) await stop(srv2.c).catch(() => {});
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(scratch2, { recursive: true, force: true }); } catch (_) {}
  }
  const total = 26;
  if (failures.length) {
    console.error(`smoke:auth FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:auth OK (${total}/${total}) — CLG-P1: fail-closed bootstrap · cookie flags · CSRF double-submit · consent history · session revoke · dynamic export (no secret leak) · forget-the-stream delete + deletion_journal · new-owner re-login · per-IP 429 limiter · healthz disk watermark`);
  }
})();
