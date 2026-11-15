'use strict';
// Stories that live across editions and days (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.2).
// A new article joins a story active in the last 36 h by the words of its title and first paragraph
// (the same rule as clusterStories); otherwise it starts a new story. The key never changes, so a story
// that goes on the next day is the same story there («продолжение со вчера»).
const crypto = require('node:crypto');
const { clusterStories } = require('./newsStories');

const ACTIVE_MS = 36 * 3600e3;
const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

function createStoryStore({ db, now = () => Date.now() }) {
  const iso = ms => new Date(ms).toISOString();
  const activeSince = ms => dbAll(db, 'SELECT * FROM news_stories WHERE last_at >= ? ORDER BY last_at DESC', [iso(ms)]);
  const get = key => dbGet(db, 'SELECT * FROM news_stories WHERE story_key = ?', [String(key)]);

  // items: [{ id, outlet_id, title, text, at }] → Map id → story_key.
  async function assign(items, { day }) {
    const rows = await activeSince(now() - ACTIVE_MS);
    const seeds = rows.map(r => ({ id: r.story_key, words: new Map(Object.entries(JSON.parse(r.words_json || '{}'))), mass: r.mass }));
    const byId = new Map(rows.map(r => [r.story_key, r]));
    const of = clusterStories(items, { seeds });
    const keyOf = new Map(), out = new Map();
    for (const s of of.stories) {
      if (!s.members.length) continue;
      const key = s.seed ? s.id : day + '-' + crypto.createHash('sha256').update(String(s.id)).digest('hex').slice(0, 8);
      keyOf.set(s.id, key);
      const prev = byId.get(key) || (s.seed ? null : await get(key));
      const outlets = new Set(prev ? JSON.parse(prev.outlets_json || '[]') : []);
      for (const m of s.members) outlets.add(m.outlet_id);
      const lastAt = Math.max(prev ? Date.parse(prev.last_at) : 0, ...s.members.map(m => m.at || 0)) || now();
      const words = JSON.stringify(Object.fromEntries(s.words));
      if (prev) await dbRun(db, 'UPDATE news_stories SET last_at=?, words_json=?, mass=?, outlets_json=? WHERE story_key=?', [iso(lastAt), words, s.mass, JSON.stringify([...outlets]), key]);
      else await dbRun(db, 'INSERT INTO news_stories(story_key, first_day, created_at, last_at, words_json, mass, outlets_json) VALUES (?,?,?,?,?,?,?)',
        [key, day, iso(now()), iso(lastAt), words, s.mass, JSON.stringify([...outlets])]);
    }
    for (const it of items) if (of.has(it.id)) out.set(it.id, keyOf.get(of.get(it.id)));
    return out;
  }

  // The story got its full study article (first one, or a development): remembered for the next editions.
  async function markFull(key, { outlets, title_he, title_ru, at }) {
    await dbRun(db, 'UPDATE news_stories SET full_at=?, full_outlets=?, full_title_he=COALESCE(?, full_title_he), full_title_ru=COALESCE(?, full_title_ru) WHERE story_key=?',
      [iso(at || now()), Number(outlets) || 0, title_he || null, title_ru || null, String(key)]);
  }
  return { assign, markFull, get, activeSince };
}

module.exports = { createStoryStore, ACTIVE_MS };
