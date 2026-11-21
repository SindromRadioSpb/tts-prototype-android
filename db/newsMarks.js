'use strict';
// Personal tags, ★ and reads of the news section (docs/superpowers/specs/2026-11-21-news-findability-design.md
// §2 п.6, п.9, §8а п.1, п.4, п.5). Every signed-in user has their own; visitors without an account keep them
// in the browser. Only the owner's marks keep an article beyond the retention: its row, its full text
// (news_pins, honoured by every cleanup) and its photos (news_pin_images — the photo cache lives 3 days).
// A tag on «story:<key>» keeps the texts of the story's articles, without photos.
const crypto = require('node:crypto');
const { bodyOf } = require('../news/harvest/newsBody');

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

const STAR = '★';
const ITEM_KEY = /^(na_[0-9a-f]{24}|story:[A-Za-z0-9_.:-]{1,120})$/;
const MAX_PHOTOS = 12;
function validTag(tag) {
  if (typeof tag !== 'string') return null;
  const t = tag.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 40 || t.startsWith('#') || /[\u0000-\u001f\u007f]/.test(t)) return null;
  return t;
}
const validKey = k => typeof k === 'string' && ITEM_KEY.test(k);

// Per-user caps (review W4 I3): any account may mark, so the storage it can take is bounded.
const LIMITS = { marks: 5000, tags: 200, reads: 20000 };
class MarksLimitError extends Error { constructor() { super('NEWS_MARKS_LIMIT'); this.code = 'NEWS_MARKS_LIMIT'; this.status = 409; } }

function createNewsMarks({ db, now = () => Date.now(), photoOf = async () => null, limits = {} } = {}) {
  const LIM = { ...LIMITS, ...limits };
  const iso = () => new Date(now()).toISOString();

  // The owner's marks keep the article: text always, photos only for a mark on the article itself.
  async function pinItem(itemKey) {
    await dbRun(db, "INSERT OR IGNORE INTO news_pins(item_key, source, pinned_at) VALUES (?, 'item', ?)", [itemKey, iso()]);
    if (await dbGet(db, 'SELECT 1 FROM news_pin_images WHERE item_key=? LIMIT 1', [itemKey])) return;
    // A study article: its stored photos; a slice article: the cached photos of its body.
    const stored = await dbAll(db, 'SELECT name, mime, sha256, bytes FROM news_images WHERE article_id=?', [itemKey]).catch(() => []);
    if (stored.length) {
      for (const s of stored) await dbRun(db, 'INSERT OR IGNORE INTO news_pin_images(item_key, name, mime, sha256, bytes) VALUES (?,?,?,?,?)', [itemKey, s.name, s.mime, s.sha256, s.bytes]);
      return;
    }
    const row = await dbGet(db, "SELECT data_json, data_gz FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND status='ready' ORDER BY first_seen_at LIMIT 1", [itemKey, itemKey]);
    const a = bodyOf(row);
    const images = (a && a.images || []).slice(0, MAX_PHOTOS);
    for (let i = 0; i < images.length; i++) {
      const bytes = await photoOf(images[i].src).catch(() => null);
      if (!bytes) continue;
      await dbRun(db, 'INSERT OR IGNORE INTO news_pin_images(item_key, name, mime, sha256, bytes) VALUES (?,?,?,?,?)',
        [itemKey, 'img-' + (i + 1) + '.jpg', 'image/jpeg', crypto.createHash('sha256').update(bytes).digest('hex'), bytes]);
    }
  }
  async function pinStory(storyKey) {
    const members = await dbAll(db, 'SELECT COALESCE(canonical_key, url_key) k FROM news_harvest_items WHERE story_key=? AND status=?', [storyKey, 'ready']);
    for (const m of members) await dbRun(db, 'INSERT OR IGNORE INTO news_pins(item_key, source, pinned_at) VALUES (?,?,?)', [m.k, 'story:' + storyKey, iso()]);
  }
  async function unpinIfUnmarked(itemKey, ownerId) {
    if (await dbGet(db, 'SELECT 1 FROM news_marks WHERE item_key=? AND actor_id=? LIMIT 1', [itemKey, ownerId])) return;
    if (itemKey.startsWith('story:')) { await dbRun(db, 'DELETE FROM news_pins WHERE source=?', [itemKey]); return; }
    await dbRun(db, "DELETE FROM news_pins WHERE item_key=? AND source='item'", [itemKey]);
    await dbRun(db, 'DELETE FROM news_pin_images WHERE item_key=?', [itemKey]);
  }

  async function mark(actor, itemKey, tag) {
    const t = validTag(tag);
    if (!actor || !actor.id || !validKey(itemKey) || !t) return false;
    const actorId = String(actor.id);
    if (!(await dbGet(db, 'SELECT 1 FROM news_marks WHERE item_key=? AND actor_id=? AND tag=?', [itemKey, actorId, t]))) {
      const c = await dbGet(db, 'SELECT COUNT(*) n, COUNT(DISTINCT tag) tags, SUM(tag=?) same FROM news_marks WHERE actor_id=?', [t, actorId]);
      if (c.n >= LIM.marks || (!c.same && c.tags >= LIM.tags)) throw new MarksLimitError();
    }
    await dbRun(db, 'INSERT OR IGNORE INTO news_marks(item_key, actor_id, tag, created_at) VALUES (?,?,?,?)', [itemKey, actorId, t, iso()]);
    if (actor.kind === 'owner') {
      if (itemKey.startsWith('story:')) await pinStory(itemKey.slice(6)); else await pinItem(itemKey);
    }
    return true;
  }
  async function unmark(actor, itemKey, tag) {
    const t = validTag(tag);
    if (!actor || !actor.id || !validKey(itemKey) || !t) return false;
    await dbRun(db, 'DELETE FROM news_marks WHERE item_key=? AND actor_id=? AND tag=?', [itemKey, String(actor.id), t]);
    if (actor.kind === 'owner') await unpinIfUnmarked(itemKey, String(actor.id));
    return true;
  }
  // → Map item_key → [tags] for this user.
  async function marksFor(actorId, keys) {
    const out = new Map(), list = [...new Set((keys || []).filter(validKey))];
    for (let i = 0; i < list.length; i += 400) {
      const part = list.slice(i, i + 400);
      for (const r of await dbAll(db, `SELECT item_key, tag FROM news_marks WHERE actor_id=? AND item_key IN (${part.map(() => '?').join(',')}) ORDER BY created_at`, [String(actorId), ...part])) {
        if (!out.has(r.item_key)) out.set(r.item_key, []);
        out.get(r.item_key).push(r.tag);
      }
    }
    return out;
  }
  const tags = async actorId => dbAll(db, 'SELECT tag, COUNT(*) n FROM news_marks WHERE actor_id=? GROUP BY tag ORDER BY n DESC, tag', [String(actorId)]);
  // Keys this user marked with a tag (stories expand to their articles).
  async function keysWith(actorId, tag) {
    const rows = await dbAll(db, 'SELECT item_key FROM news_marks WHERE actor_id=? AND tag=?', [String(actorId), tag]);
    const keys = new Set();
    for (const r of rows) {
      if (!r.item_key.startsWith('story:')) { keys.add(r.item_key); continue; }
      for (const m of await dbAll(db, 'SELECT item_key FROM news_index WHERE story_key=?', [r.item_key.slice(6)]).catch(() => [])) keys.add(m.item_key);
    }
    return [...keys];
  }
  async function read(actorId, itemKey) {
    if (!actorId || !validKey(itemKey)) return false;
    await dbRun(db, 'INSERT INTO news_reads(item_key, actor_id, at) VALUES (?,?,?) ON CONFLICT(item_key, actor_id) DO UPDATE SET at=excluded.at', [itemKey, String(actorId), iso()]);
    // Only the latest reads are kept per user.
    await dbRun(db, 'DELETE FROM news_reads WHERE actor_id=? AND rowid NOT IN (SELECT rowid FROM news_reads WHERE actor_id=? ORDER BY at DESC, rowid DESC LIMIT ?)', [String(actorId), String(actorId), LIM.reads]);
    return true;
  }
  async function readSet(actorId, keys) {
    const out = new Set(), list = [...new Set((keys || []).filter(validKey))];
    for (let i = 0; i < list.length; i += 400) {
      const part = list.slice(i, i + 400);
      for (const r of await dbAll(db, `SELECT item_key FROM news_reads WHERE actor_id=? AND item_key IN (${part.map(() => '?').join(',')})`, [String(actorId), ...part])) out.add(r.item_key);
    }
    return out;
  }
  const pinImage = (itemKey, name) => dbGet(db, 'SELECT mime, sha256, bytes FROM news_pin_images WHERE item_key=? AND name=?', [itemKey, name]);
  return { mark, unmark, marksFor, tags, keysWith, read, readSet, pinImage };
}

module.exports = { createNewsMarks, validTag, validKey, STAR, LIMITS };
