'use strict';
// Keys of the home PC that harvests outlets closed to the server (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md
// §6.1). A relay key can only hand in harvested articles and their photos: it is not an editor key and not a session.
const crypto = require('node:crypto');
const { dbGet, dbAll, dbRun } = require('../db/newsRepo');

const KEY = /^lpr_[A-Za-z0-9_-]{43}$/;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

function createRelayAuth({ db, now = () => Date.now() } = {}) {
  const iso = () => new Date(now()).toISOString();
  async function issue(label, actor) {
    const keyId = 'nrk_' + crypto.randomBytes(8).toString('hex'), key = 'lpr_' + crypto.randomBytes(32).toString('base64url');
    await dbRun(db, "INSERT INTO news_relay_keys(key_id,label,key_sha256,status,created_by,created_at) VALUES(?,?,?,'ACTIVE',?,?)",
      [keyId, String(label || 'home PC').trim().slice(0, 80) || 'home PC', sha(key), String(actor), iso()]);
    return { key_id: keyId, key };
  }
  const list = () => dbAll(db, 'SELECT key_id,label,status,created_at,revoked_at,last_used_at FROM news_relay_keys ORDER BY created_at DESC');
  async function revoke(keyId) {
    const r = await dbRun(db, "UPDATE news_relay_keys SET status='REVOKED', revoked_at=? WHERE key_id=? AND status='ACTIVE'", [iso(), String(keyId)]);
    return { key_id: String(keyId), revoked: r.changes === 1 };
  }
  // → { key_id } | null, from «Authorization: Bearer lpr_…».
  async function resolve(req) {
    const h = String((req.headers && req.headers.authorization) || '');
    if (!h.startsWith('Bearer ')) return null;
    const key = h.slice(7).trim();
    if (!KEY.test(key)) return null;
    const row = await dbGet(db, "SELECT key_id FROM news_relay_keys WHERE key_sha256=? AND status='ACTIVE'", [sha(key)]);
    if (!row) return null;
    await dbRun(db, 'UPDATE news_relay_keys SET last_used_at=? WHERE key_id=?', [iso(), row.key_id]);
    return { key_id: row.key_id };
  }
  return { issue, list, revoke, resolve };
}
module.exports = { createRelayAuth };
