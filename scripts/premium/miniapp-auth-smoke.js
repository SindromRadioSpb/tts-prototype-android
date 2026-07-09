"use strict";

// Gate: smoke:miniapp-auth — CLG-P8.1 (TELEGRAM_MINI_APP_P8_1_SPEC_2026_07_09.md §6).
// INDEPENDENT ORACLE: this file signs initData with its OWN inline HMAC construction (per the
// Telegram spec), NOT the module's signing helper — so validateInitData is checked against an
// independent implementation, never against itself. Hermetic temp DB; real migrations; real
// identityRepo session lifecycle. Exits non-zero on any failure.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const { initDb, getDb, closeDb } = require(path.join(ROOT, "db", "sqlite"));
const { runMigrations } = require(path.join(ROOT, "db", "migrate"));
const identity = require(path.join(ROOT, "db", "identityRepo"));
const channelLinkRepo = require(path.join(ROOT, "db", "channelLinkRepo"));
const miniappAuth = require(path.join(ROOT, "agent", "telegram", "miniappAuth"));

const TEST_TOKEN = "123456:TEST_BOT_TOKEN_smoke_only";
const OTHER_TOKEN = "999999:WRONG_TOKEN";

// ── independent Telegram initData signer (spec-faithful, not the module's helper) ──
function signInitData(fields, token) {
  const data = {};
  for (const k of Object.keys(fields)) if (k !== "hash" && k !== "signature") data[k] = fields[k];
  const dcs = Object.keys(data).sort().map((k) => k + "=" + data[k]).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dcs).digest("hex");
  const usp = new URLSearchParams();
  for (const k of Object.keys(data)) usp.set(k, data[k]);
  usp.set("hash", hash);
  return usp.toString();
}

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };
const dbRun = (sql, p = []) => new Promise((res, rej) => getDb().run(sql, p, function (e) { e ? rej(e) : res(this); }));

(async () => {
  const dir = path.join(ROOT, ".tmp", "miniapp-auth-smoke");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "app.db");
  for (const suf of ["", "-wal", "-shm"]) { try { fs.unlinkSync(dbPath + suf); } catch (_) {} }

  await initDb(dbPath);
  await runMigrations({ migrationsDir: path.join(ROOT, "migrations") });

  // migration 034 applied?
  const cols = await new Promise((r) => getDb().all("PRAGMA table_info(user_sessions)", [], (e, rows) => r(rows || [])));
  const colNames = cols.map((c) => c.name);
  ok("034: user_sessions.session_kind", colNames.includes("session_kind"));
  ok("034: user_sessions.channel_link_id", colNames.includes("channel_link_id"));
  ok("034: user_sessions.absolute_expires_at", colNames.includes("absolute_expires_at"));
  ok("034: user_sessions.auth_context_version", colNames.includes("auth_context_version"));

  const owner = await identity.ensureOwnerUser();
  const userId = owner.id;
  const TG_ID = "7777777777777777777";            // 19 digits — must survive as a STRING (no 32-bit truncation)

  // active channel link so the identity mapping resolves
  const linkId = "cl_smoke_1";
  await dbRun(
    `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at)
     VALUES (?,?,'telegram',?,?, 'active','tg-v1', ?)`,
    [linkId, userId, TG_ID, TG_ID, new Date().toISOString()]
  );
  const link = await channelLinkRepo.getActiveLinkByTg(TG_ID, "telegram");
  ok("mapping: getActiveLinkByTg resolves to user", link && link.user_id === userId);

  // ── validateInitData ──
  const nowSec = Math.floor(Date.now() / 1000);
  const goodFields = { auth_date: String(nowSec), query_id: "AAA", user: JSON.stringify({ id: TG_ID, first_name: "Owner" }) };
  const goodRaw = signInitData(goodFields, TEST_TOKEN);

  const v = miniappAuth.validateInitData(goodRaw, { token: TEST_TOKEN });
  ok("initData: valid signature accepted", v.ok === true);
  ok("initData: telegram id preserved as full string", v.ok && v.telegramUserId === TG_ID);

  const vNoTok = miniappAuth.validateInitData(goodRaw, { token: "" });
  ok("initData: missing bot token → BOT_TOKEN_MISSING", vNoTok.code === "BOT_TOKEN_MISSING");

  const vWrongTok = miniappAuth.validateInitData(goodRaw, { token: OTHER_TOKEN });
  ok("initData: wrong bot token → BAD_HASH", vWrongTok.code === "BAD_HASH");

  const tampered = goodRaw.replace(/first_name%22%3A%22Owner/, "first_name%22%3A%22Mallory");
  const vTamper = miniappAuth.validateInitData(tampered, { token: TEST_TOKEN });
  ok("initData: tampered field → BAD_HASH", vTamper.code === "BAD_HASH");

  const staleRaw = signInitData({ auth_date: String(nowSec - 4000), user: goodFields.user }, TEST_TOKEN);
  ok("initData: stale auth_date → AUTH_STALE", miniappAuth.validateInitData(staleRaw, { token: TEST_TOKEN, maxAgeSec: 3600 }).code === "AUTH_STALE");

  const futureRaw = signInitData({ auth_date: String(nowSec + 5000), user: goodFields.user }, TEST_TOKEN);
  ok("initData: future auth_date → AUTH_FUTURE", miniappAuth.validateInitData(futureRaw, { token: TEST_TOKEN }).code === "AUTH_FUTURE");

  const noUserRaw = signInitData({ auth_date: String(nowSec) }, TEST_TOKEN);
  ok("initData: missing user → NO_USER", miniappAuth.validateInitData(noUserRaw, { token: TEST_TOKEN }).code === "NO_USER");

  const noHash = "auth_date=" + nowSec + "&user=%7B%7D";
  ok("initData: missing hash → NO_HASH", miniappAuth.validateInitData(noHash, { token: TEST_TOKEN }).code === "NO_HASH");

  // ── replay ledger ──
  const dk = miniappAuth.initDataDedupKey(v.hash);
  const r1 = await identity.recordMiniappInitDataSeen(userId, dk, v.authDate);
  const r2 = await identity.recordMiniappInitDataSeen(userId, dk, v.authDate);
  ok("replay: first sight fresh", r1.fresh === true);
  ok("replay: second sight not fresh", r2.fresh === false);

  // ── session lifecycle ──
  const acv = await identity.getUserAuthContextVersion(userId);
  const sess = await identity.createMiniappSession(userId, { channelLinkId: linkId, authContextVersion: acv });
  const valid = await identity.validateMiniappSession(sess.cookieValue, { idleMs: 2 * 3600 * 1000 });
  ok("session: valid miniapp cookie resolves user", valid && valid.user.id === userId);
  ok("session: carries channel_link_id", valid && valid.channelLinkId === linkId);

  ok("session: wrong secret → null", (await identity.validateMiniappSession(sess.sessionId + ".deadbeef")) === null);

  // audience separation: a miniapp cookie must NOT validate on the PWA path
  ok("audience: PWA validateSession rejects miniapp session", (await identity.validateSession(sess.cookieValue)) === null);
  // and a real PWA session must NOT validate on the miniapp path
  const pwa = await identity.createSession(userId, {});
  ok("audience: miniapp validator rejects PWA session", (await identity.validateMiniappSession(pwa.cookieValue)) === null);
  ok("audience: PWA validator accepts PWA session", (await identity.validateSession(pwa.cookieValue)) !== null);

  // structural revoke via auth_context_version bump
  await identity.bumpUserAuthContextVersion(userId);
  ok("revoke: acv bump invalidates existing miniapp session (no row sweep)",
    (await identity.validateMiniappSession(sess.cookieValue)) === null);
  // a session minted AFTER the bump (with the new snapshot) is valid again
  const acv2 = await identity.getUserAuthContextVersion(userId);
  const sess2 = await identity.createMiniappSession(userId, { channelLinkId: linkId, authContextVersion: acv2 });
  ok("revoke: post-bump session valid", (await identity.validateMiniappSession(sess2.cookieValue)) !== null);

  // absolute cap: force absolute_expires_at into the past (idle still fresh) → validate rejects
  const sessAbs = await identity.createMiniappSession(userId, { channelLinkId: linkId, authContextVersion: acv2 });
  await dbRun(`UPDATE user_sessions SET absolute_expires_at = ? WHERE id = ?`, [new Date(Date.now() - 1000).toISOString(), sessAbs.sessionId]);
  ok("session: past absolute cap → null", (await identity.validateMiniappSession(sessAbs.cookieValue)) === null);

  // idle expiry: force expires_at into the past
  const sessIdle = await identity.createMiniappSession(userId, { channelLinkId: linkId, authContextVersion: acv2 });
  await dbRun(`UPDATE user_sessions SET expires_at = ? WHERE id = ?`, [new Date(Date.now() - 1000).toISOString(), sessIdle.sessionId]);
  ok("session: past idle expiry → null", (await identity.validateMiniappSession(sessIdle.cookieValue)) === null);

  // ── GDPR sweep coverage (structural) ──
  const swept = await identity.listUserScopedTables();
  ok("gdpr: user_sessions in sweep", swept.includes("user_sessions"));
  ok("gdpr: miniapp_initdata_seen in sweep", swept.includes("miniapp_initdata_seen"));
  const exp = await identity.exportUserData(userId);
  const sessRows = exp.tables.user_sessions || [];
  ok("gdpr: export strips session token_hash", sessRows.length > 0 && sessRows.every((r) => r.token_hash === undefined));
  const del = await identity.countUserRows(userId);
  ok("gdpr: user has rows before delete", del.total > 0);

  await closeDb();
  console.log(`\nsmoke:miniapp-auth — ${pass}/${pass + fail} passed`);
  if (fail) { console.error(`FAILED: ${fail}`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
