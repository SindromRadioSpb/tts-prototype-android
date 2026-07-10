"use strict";

// CLG-P8.1 — Telegram Mini App initData validation (TELEGRAM_MINI_APP_P8_SECURITY_2026_07_09.md §8.1).
// First-party HMAC-SHA256 validation: we hold the bot token, so we use the `hash` field (not the
// Ed25519 `signature` third-party path). Pure/stateless: no DB, no env beyond TELEGRAM_BOT_TOKEN.
// The session mint / replay ledger / channel-link mapping live in server.js + identityRepo +
// channelLinkRepo — this module ONLY proves the initData is authentic and fresh.

const crypto = require("crypto");

function botToken() { return process.env.TELEGRAM_BOT_TOKEN || ""; }

const MAX_INITDATA_BYTES = 4096;
const FUTURE_SKEW_SEC = 60;

// Parse raw `Telegram.WebApp.initData` (urlencoded) into a flat {key: value} of decoded strings.
// URLSearchParams decodes percent-encoding once, exactly as Telegram signs the decoded values.
function parseInitData(raw) {
  const out = {};
  const params = new URLSearchParams(String(raw || ""));
  for (const [k, v] of params) out[k] = v;
  return out;
}

// data-check-string (FIRST-PARTY HMAC): every field EXCEPT hash — and ONLY hash —
// sorted alphabetically by key, joined "key=value" with a single LF. Since Bot API 8.0
// initData also carries an Ed25519 `signature` field: it STAYS IN the HMAC check-string
// ("all received fields ... with the hash field removed" — core.telegram.org; matches
// aiogram/telegraf reference validators). Excluding it was the P8.1 live BAD_HASH bug
// (owner live-verify 2026-07-10): our string differed from what Telegram signed.
// (`signature` is excluded only in the separate THIRD-PARTY Ed25519 check, which also
// prepends "<bot_id>:WebAppData" — a different scheme we do not use: we hold the token.)
function buildDataCheckString(data) {
  return Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => k + "=" + data[k])
    .join("\n");
}

function timingEqualHex(aHex, bHex) {
  const a = Buffer.from(String(aHex), "utf8");
  const b = Buffer.from(String(bHex), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Validate raw initData. Returns:
//   { ok:true, telegramUserId, authDate, hash, user, startParam }
//   { ok:false, code } — codes: BOT_TOKEN_MISSING | TOO_LARGE | NO_HASH | BAD_HASH | NO_AUTH_DATE |
//                                 AUTH_STALE | AUTH_FUTURE | NO_USER
// opts.now (ms) and opts.token override are for the smoke gate's independent construction.
function validateInitData(raw, opts = {}) {
  const token = opts.token != null ? String(opts.token) : botToken();
  if (!token) return { ok: false, code: "BOT_TOKEN_MISSING" };
  if (Buffer.byteLength(String(raw || ""), "utf8") > MAX_INITDATA_BYTES) return { ok: false, code: "TOO_LARGE" };

  const data = parseInitData(raw);
  const hash = data.hash;
  if (!hash) return { ok: false, code: "NO_HASH" };

  // secret_key = HMAC_SHA256(key="WebAppData", data=bot_token); check = HMAC_SHA256(secret_key, dcs).
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(buildDataCheckString(data)).digest("hex");
  if (!timingEqualHex(computed, hash)) return { ok: false, code: "BAD_HASH" };

  const authDate = Number(data.auth_date) || 0;
  if (!authDate) return { ok: false, code: "NO_AUTH_DATE" };
  const nowSec = Math.floor((opts.now != null ? opts.now : Date.now()) / 1000);
  const maxAgeSec = Number(opts.maxAgeSec) || 3600;
  if (nowSec - authDate > maxAgeSec) return { ok: false, code: "AUTH_STALE" };
  if (authDate - nowSec > FUTURE_SKEW_SEC) return { ok: false, code: "AUTH_FUTURE" };

  let user = null;
  try { user = JSON.parse(data.user || "null"); } catch (_) { user = null; }
  if (!user || user.id == null || String(user.id) === "") return { ok: false, code: "NO_USER" };

  // Telegram numeric id kept as a STRING end-to-end (no 32-bit truncation; channel_links stores TEXT).
  return {
    ok: true,
    telegramUserId: String(user.id),
    authDate,
    hash,
    user,
    startParam: data.start_param != null ? String(data.start_param) : null,
  };
}

// Deterministic dedup key for the replay ledger: sha256 of the initData hash (the hash itself is not
// a secret, but we store its digest, never the raw value, to keep raw signature material out of the DB).
function initDataDedupKey(hash) {
  return crypto.createHash("sha256").update(String(hash), "utf8").digest("hex");
}

// Test-only helper: build a correctly-signed initData string (used by smoke:miniapp-auth to construct
// expected inputs INDEPENDENTLY of validateInitData — not exported for production callers).
// Mirrors Telegram's real signer: `signature` (if present) is part of the signed check-string.
function _signInitDataForTest(fields, token) {
  const data = Object.assign({}, fields);
  delete data.hash;
  const dcs = Object.keys(data).sort().map((k) => k + "=" + data[k]).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(String(token)).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dcs).digest("hex");
  const usp = new URLSearchParams();
  for (const k of Object.keys(data)) usp.set(k, data[k]);
  usp.set("hash", hash);
  return usp.toString();
}

module.exports = {
  validateInitData,
  initDataDedupKey,
  parseInitData,
  buildDataCheckString,
  botToken,
  _signInitDataForTest,
};
