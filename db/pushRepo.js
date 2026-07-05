"use strict";

// CLG-P4.5 — Web Push repo (AI_MENTOR_RECON §8/§9 P4.5). Первый return-trigger пивота:
// ежедневный нудж «N слов ждут повторения» БЕЗ содержимого; deep-link в Зал. Правила §8:
//   • один нудж/день (last_notified_day, UTC) — единый бюджет уведомлений до P7-механики;
//   • счётчик = ТО ЖЕ правило, что /api/learner/due (ignore исключён) — пуш никогда не
//     over-claim-ит vs то, что покажет due-кольцо (R11 honest count; §8 гейт «число в пуше
//     == число в кольце после sync»);
//   • 404/410 от push-сервиса → подписка мертва → удаляется (не копим трупы);
//   • VAPID: env VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY, иначе авто-генерация ОДИН раз на
//     volume (DATA_DIR/vapid-keys.json) — подписки привязаны к ключу, он обязан быть стабилен.
const path = require("path");
const fs = require("fs");
const webpush = require("web-push");
const { getDb } = require("./sqlite");
const { DATA_DIR } = require("../storage");
const learnerGraphRepo = require("./learnerGraphRepo");

const PUSH_HOUR_UTC = Math.min(23, Math.max(0, Number(process.env.PUSH_HOUR_UTC) || 6));   // ≈9:00 Израиля
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:sindromradiospb@gmail.com";

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}

let _vapid = null;
function ensureVapid() {
  if (_vapid) return _vapid;
  const envPub = process.env.VAPID_PUBLIC_KEY || "", envPriv = process.env.VAPID_PRIVATE_KEY || "";
  if (envPub && envPriv) {
    _vapid = { publicKey: envPub, privateKey: envPriv, source: "env" };
  } else {
    const p = path.join(DATA_DIR, "vapid-keys.json");
    try {
      if (fs.existsSync(p)) {
        const k = JSON.parse(fs.readFileSync(p, "utf8"));
        _vapid = { publicKey: k.publicKey, privateKey: k.privateKey, source: "volume" };
      } else {
        const k = webpush.generateVAPIDKeys();
        fs.writeFileSync(p, JSON.stringify(k));
        _vapid = { publicKey: k.publicKey, privateKey: k.privateKey, source: "volume-generated" };
      }
    } catch (e) {
      throw new Error("VAPID_UNAVAILABLE: " + e.message);
    }
  }
  webpush.setVapidDetails(SUBJECT, _vapid.publicKey, _vapid.privateKey);
  return _vapid;
}

async function subscribe(userId, deviceId, sub) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const endpoint = sub && sub.endpoint ? String(sub.endpoint) : "";
  const p256dh = sub && sub.keys && sub.keys.p256dh ? String(sub.keys.p256dh) : "";
  const auth = sub && sub.keys && sub.keys.auth ? String(sub.keys.auth) : "";
  if (!endpoint || !/^https?:\/\//.test(endpoint) || endpoint.length > 1000) return { ok: false, error: "BAD_ENDPOINT" };
  if (!p256dh || !auth) return { ok: false, error: "BAD_KEYS" };
  await dbRun(db,
    `INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, device_id)
     VALUES (?,?,?,?,?)
     ON CONFLICT(user_id, endpoint) DO UPDATE SET keys_p256dh = excluded.keys_p256dh,
       keys_auth = excluded.keys_auth, device_id = excluded.device_id, failed_count = 0`,
    [userId, endpoint, p256dh, auth, deviceId || null]);
  return { ok: true };
}

async function unsubscribe(userId, endpoint) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db, `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`, [userId, String(endpoint || "")]);
  return { ok: true, removed: r.changes > 0 };
}

async function status(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db, `SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?`, [userId]);
  return { count: Number(row && row.c) || 0 };
}

async function _send(db, sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
      JSON.stringify(payload), { TTL: 12 * 3600 });
    await dbRun(db, `UPDATE push_subscriptions SET last_ok_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), failed_count = 0
                      WHERE user_id = ? AND endpoint = ?`, [sub.user_id, sub.endpoint]);
    return { ok: true };
  } catch (e) {
    const code = e && e.statusCode;
    if (code === 404 || code === 410) {
      await dbRun(db, `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`, [sub.user_id, sub.endpoint]);
      return { ok: false, removed: true, code };
    }
    await dbRun(db, `UPDATE push_subscriptions SET failed_count = failed_count + 1 WHERE user_id = ? AND endpoint = ?`, [sub.user_id, sub.endpoint]);
    return { ok: false, code: code || null, message: e && e.message };
  }
}

function _nudgePayload(dueN) {
  return {
    title: "LinguistPro",
    body: "⏰ " + dueN + " слов ждут повторения",
    url: "/library.html",
    tag: "lp-due-nudge",
  };
}

// Immediate send to ALL of the user's subscriptions (the ☁-modal «Проверить» + owner verify).
async function sendTest(userId) {
  ensureVapid();
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const subs = await dbAll(db, `SELECT * FROM push_subscriptions WHERE user_id = ?`, [userId]);
  if (!subs || !subs.length) return { ok: false, error: "NO_SUBSCRIPTIONS" };
  const due = await learnerGraphRepo.getDue(userId, { limit: 500 });
  const results = [];
  for (const s of subs) results.push(await _send(db, s, _nudgePayload(due.length)));
  return { ok: results.some((r) => r.ok), sent: results.filter((r) => r.ok).length,
    removed: results.filter((r) => r.removed).length, due: due.length };
}

// The daily sweep: at PUSH_HOUR_UTC, each subscribed user with due>0 gets ONE nudge per UTC day.
// `force` ignores the hour+day gates (admin/gate use). Injectable nowMs — no Date.now in gates.
async function runPushSweep({ nowMs, force } = {}) {
  ensureVapid();
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs) || Date.now();
  const d = new Date(now);
  const day = d.toISOString().slice(0, 10);
  if (!force && d.getUTCHours() !== PUSH_HOUR_UTC) return { ok: true, skipped: "not_the_hour", hour: d.getUTCHours() };
  const subs = await dbAll(db, `SELECT * FROM push_subscriptions`, []);
  const byUser = new Map();
  for (const s of (subs || [])) { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); }
  let notified = 0, skippedDay = 0, quiet = 0, removed = 0;
  for (const [userId, list] of byUser) {
    const fresh = list.filter((s) => force || s.last_notified_day !== day);
    if (!fresh.length) { skippedDay += list.length; continue; }
    const due = await learnerGraphRepo.getDue(userId, { nowMs: now, limit: 500 });
    if (!due.length) { quiet++; continue; }
    const payload = _nudgePayload(due.length);
    for (const s of fresh) {
      const r = await _send(db, s, payload);
      if (r.ok) {
        notified++;
        await dbRun(db, `UPDATE push_subscriptions SET last_notified_day = ? WHERE user_id = ? AND endpoint = ?`, [day, userId, s.endpoint]);
      } else if (r.removed) removed++;
    }
  }
  return { ok: true, day, notified, skippedDay, quiet, removed };
}

module.exports = { ensureVapid, subscribe, unsubscribe, status, sendTest, runPushSweep, PUSH_HOUR_UTC };
