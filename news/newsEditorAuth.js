'use strict';
// "News editor" access (plan Task 5). The app has one owner login; an editor (the dot agent) gets
// its own key and its own sessions, which ONLY the /api/news/editor/* routes accept. An editor key
// never becomes an lp_session, so no other route of the app can be reached with it.
const crypto = require('node:crypto');
const { dbGet, dbAll, dbRun } = require('../db/newsRepo');

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
const KEY = /^lpne_[A-Za-z0-9_-]{43}$/;
const COOKIE = 'lp_news_editor';
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) { try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch (_) { return ''; } }
  }
  return '';
}

function createNewsEditorAuth({ db, now = () => Date.now() } = {}) {
  const iso = (ms = now()) => new Date(ms).toISOString();

  async function createEditor(ownerId, label) {
    const editorId = 'ned_' + crypto.randomBytes(8).toString('hex'), key = 'lpne_' + token();
    await dbRun(db, "INSERT INTO news_editors(editor_id,label,key_sha256,status,created_by,created_at) VALUES(?,?,?,'ACTIVE',?,?)",
      [editorId, String(label || 'dot').trim().slice(0, 80) || 'dot', sha(key), String(ownerId), iso()]);
    return { editor_id: editorId, key };
  }
  const listEditors = () => dbAll(db, 'SELECT editor_id,label,status,created_at,revoked_at FROM news_editors ORDER BY created_at DESC');
  async function revokeEditor(ownerId, editorId) {
    const r = await dbRun(db, "UPDATE news_editors SET status='REVOKED', revoked_at=? WHERE editor_id=? AND status='ACTIVE'", [iso(), String(editorId)]);
    await dbRun(db, 'DELETE FROM news_editor_sessions WHERE editor_id=?', [String(editorId)]);
    return { editor_id: String(editorId), revoked: r.changes === 1 };
  }
  async function editorByKey(key) {
    if (!KEY.test(String(key || ''))) return null;
    return dbGet(db, "SELECT editor_id,label FROM news_editors WHERE key_sha256=? AND status='ACTIVE'", [sha(key)]);
  }
  async function login(key) {
    const editor = await editorByKey(key);
    if (!editor) return null;
    const cookie = token(), csrf = token(), expires = now() + SESSION_TTL_MS;
    await dbRun(db, 'DELETE FROM news_editor_sessions WHERE expires_at<?', [iso()]);
    await dbRun(db, 'INSERT INTO news_editor_sessions(session_sha256,editor_id,csrf,created_at,expires_at) VALUES(?,?,?,?,?)',
      [sha(cookie), editor.editor_id, csrf, iso(), iso(expires)]);
    return { cookie, csrf, expires_at: iso(expires), editor_id: editor.editor_id, label: editor.label, max_age_sec: Math.floor(SESSION_TTL_MS / 1000) };
  }
  async function logout(req) {
    const c = readCookie(req, COOKIE);
    if (c) await dbRun(db, 'DELETE FROM news_editor_sessions WHERE session_sha256=?', [sha(c)]);
  }
  // → { id, editor_id, label, kind:'editor', via:'bearer'|'cookie', csrf? } | null
  async function resolve(req) {
    const h = String(req.headers.authorization || '');
    if (h.startsWith('Bearer ')) {
      const editor = await editorByKey(h.slice(7).trim());
      return editor ? { id: 'editor:' + editor.editor_id, editor_id: editor.editor_id, label: editor.label, kind: 'editor', via: 'bearer' } : null;
    }
    const c = readCookie(req, COOKIE);
    if (!c) return null;
    const row = await dbGet(db, `SELECT s.editor_id, s.csrf, e.label FROM news_editor_sessions s JOIN news_editors e ON e.editor_id=s.editor_id
      WHERE s.session_sha256=? AND s.expires_at>? AND e.status='ACTIVE'`, [sha(c), iso()]);
    return row ? { id: 'editor:' + row.editor_id, editor_id: row.editor_id, label: row.label, kind: 'editor', via: 'cookie', csrf: row.csrf } : null;
  }
  return { createEditor, listEditors, revokeEditor, login, logout, resolve, COOKIE };
}
module.exports = { createNewsEditorAuth, readCookie, COOKIE };
