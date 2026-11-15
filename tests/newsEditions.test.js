'use strict';
// News editions (docs/superpowers/specs/2026-11-15-news-editions-design.md): one day, four editions.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const { DEFAULT_SCHEDULE, normalizeSchedule, israelAt, dayOf, slotTimes, dueSlot } = require('../news/harvest/newsEditions');

const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));
const MIGRATIONS = ['078_news.sql', '079_news_manage.sql', '080_news_images.sql', '081_news_harvest.sql', '082_news_harvest_items.sql', '083_news_editions.sql'];
async function openDb() {
  const db = new sqlite3.Database(':memory:');
  for (const m of MIGRATIONS) await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', m), 'utf8'));
  return db;
}

test('dayOf: before the morning cut-off is still yesterday', () => {
  assert.equal(dayOf(Date.parse('2026-11-16T03:59:00Z'), DEFAULT_SCHEDULE), '2026-11-15'); // 05:59 Israel
  assert.equal(dayOf(Date.parse('2026-11-16T04:00:00Z'), DEFAULT_SCHEDULE), '2026-11-16'); // 06:00 Israel
});
test('dayOf/slotDue across DST', () => {
  assert.equal(israelAt('2027-03-26', '06:00'), Date.parse('2027-03-26T03:00:00Z')); // summer +03
  assert.equal(israelAt('2026-10-25', '06:00'), Date.parse('2026-10-25T04:00:00Z')); // winter +02
  assert.equal(dayOf(israelAt('2027-03-26', '05:59'), DEFAULT_SCHEDULE), '2027-03-25');
  assert.equal(dayOf(israelAt('2026-10-25', '06:00'), DEFAULT_SCHEDULE), '2026-10-25');
});
test('slotTimes: four slots of the day in order', () => {
  const s = slotTimes('2026-11-16', DEFAULT_SCHEDULE);
  assert.deepEqual(s.map(x => x.slot), ['morning', 'midday', 'evening', 'late']);
  assert.equal(s[1].cutoffMs, Date.parse('2026-11-16T08:30:00Z'));
  assert.equal(s[1].readyMs, Date.parse('2026-11-16T10:00:00Z'));
});
test('dueSlot: the latest passed slot without an edition; earlier empty slots are skipped', () => {
  const t = israelAt('2026-11-16', '17:00');
  assert.equal(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'published' }]).slot, 'evening');
  assert.deepEqual(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'published' }]).skip, ['midday']);
  assert.equal(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'published' }, { slot: 'evening', status: 'archived' }]), null);
  assert.equal(dueSlot(israelAt('2026-11-16', '10:29'), DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'archived' }]), null);
  assert.equal(dueSlot(israelAt('2026-11-16', '06:01'), DEFAULT_SCHEDULE, []).day, '2026-11-16');
});
test('dueSlot: a failed build is retried once, then left', () => {
  const t = israelAt('2026-11-16', '06:30');
  assert.equal(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'failed' }]).slot, 'morning');
  assert.equal(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'failed' }, { slot: 'morning', status: 'failed' }]), null);
});
test('normalizeSchedule rejects cut-offs out of order and ready before cut-off', () => {
  assert.throws(() => normalizeSchedule({ slots: { midday: { cutoff: '05:00' } } }), /SCHEDULE_INVALID/);
  assert.throws(() => normalizeSchedule({ slots: { evening: { cutoff: '16:30', ready: '16:00' } } }), /SCHEDULE_INVALID/);
  assert.throws(() => normalizeSchedule({ slots: { late: { main: 0 } } }), /SCHEDULE_INVALID/);
  assert.equal(normalizeSchedule({ slots: { evening: { main: 10 } } }).slots.evening.main, 10);
  assert.equal(normalizeSchedule(null).slots.morning.main, 22);
});
test('migration 083 applies on top of 082', async () => {
  const db = await openDb();
  const cols = (await all(db, 'PRAGMA table_info(news_harvest_items)')).map(c => c.name);
  for (const c of ['story_key', 'edition_id', 'overview_state', 'main_state', 'main_attempts', 'selected_by', 'draft_images_json', 'lease_until']) assert.ok(cols.includes(c), c);
  const tables = (await all(db, "SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name);
  for (const t of ['news_settings', 'news_editions', 'news_stories', 'news_overview_items']) assert.ok(tables.includes(t), t);
  db.close();
});

// ---- A2: stories persist across editions and days ----------------------------------------------------
const { createStoryStore } = require('../news/harvest/newsStoryStore');
const OTHER = [
  ['walla', 'סערה בים התיכון: גלים של שישה מטרים בחופי חיפה'],
  ['n12', 'מכבי תל אביב ניצחה את הפועל ירושלים בדרבי'],
  ['ynet', 'מחירי הדירות עלו בחודש האחרון בשלושה אחוזים'],
];
const item = (id, outlet, title, atIso) => ({ id, outlet_id: outlet, title, text: '', at: Date.parse(atIso) });
test('stories persist: an afternoon article about the morning event joins the morning story', async () => {
  const db = await openDb();
  let now = Date.parse('2026-11-16T04:30:00Z');
  const store = createStoryStore({ db, now: () => now });
  const morning = [item('a1', 'ynet', 'הכנסת אישרה את תקציב המדינה לשנת 2027', '2026-11-16T04:00:00Z'),
    item('a2', 'walla', 'תקציב המדינה לשנת 2027 אושר בכנסת ברוב קטן', '2026-11-16T04:05:00Z'),
    ...OTHER.map(([o, t], i) => item('o' + i, o, t, '2026-11-16T04:10:00Z'))];
  const m1 = await store.assign(morning, { day: '2026-11-16' });
  const K = m1.get('a1');
  assert.equal(m1.get('a2'), K);
  assert.match(K, /^2026-11-16-[0-9a-f]{8}$/);
  now = Date.parse('2026-11-16T12:00:00Z');
  const m2 = await store.assign([item('b1', 'n12', 'תקציב המדינה אושר בכנסת: מה זה אומר לכם', '2026-11-16T11:50:00Z')], { day: '2026-11-16' });
  assert.equal(m2.get('b1'), K);
  assert.deepEqual(JSON.parse((await store.get(K)).outlets_json).sort(), ['n12', 'walla', 'ynet']);
  db.close();
});
test('stories persist: a story from yesterday keeps its key today (continued)', async () => {
  const db = await openDb();
  let now = Date.parse('2026-11-15T16:00:00Z');
  const store = createStoryStore({ db, now: () => now });
  const k1 = (await store.assign([item('c1', 'ynet', 'שביתה כללית במשק: ההסתדרות הכריזה על השבתה', '2026-11-15T15:50:00Z'),
    ...OTHER.map(([o, t], i) => item('p' + i, o, t, '2026-11-15T15:00:00Z'))], { day: '2026-11-15' })).get('c1');
  now = Date.parse('2026-11-16T12:00:00Z');
  const k2 = (await store.assign([item('c2', 'maariv', 'השביתה הכללית במשק נמשכת: ההסתדרות מאיימת', '2026-11-16T11:00:00Z')], { day: '2026-11-16' })).get('c2');
  assert.equal(k2, k1);
  assert.equal((await store.get(k1)).first_day, '2026-11-15');
  db.close();
});
test('stories persist: an unrelated article starts a new story', async () => {
  const db = await openDb();
  const store = createStoryStore({ db, now: () => Date.parse('2026-11-16T12:00:00Z') });
  const m1 = await store.assign([item('d1', 'ynet', 'הכנסת אישרה את תקציב המדינה לשנת 2027', '2026-11-16T11:00:00Z')], { day: '2026-11-16' });
  const m2 = await store.assign([item('d2', 'walla', 'מכבי תל אביב ניצחה את הפועל ירושלים בדרבי', '2026-11-16T11:30:00Z')], { day: '2026-11-16' });
  assert.notEqual(m2.get('d2'), m1.get('d1'));
  assert.match(m2.get('d2'), /^2026-11-16-[0-9a-f]{8}$/);
  db.close();
});

// ---- A3: per-edition selection -------------------------------------------------------------------------
const { selectEdition } = require('../news/harvest/newsStories');
const OUT = ['ynet', 'walla', 'maariv', 'n12', 'haaretz', 'c14'];
let seq = 0;
const member = (outlet, section = 'news', title = 'כותרת ' + (++seq)) => ({ id: 'm' + (++seq), outlet_id: outlet, section, title, text: '', at: Date.parse('2026-11-16T09:00:00Z') + seq * 1000, full_ok: true, paywalled: 0, images: 2, chars: 3000 });
const story = (id, outlets, section = 'news', title) => ({ id, members: OUT.slice(0, outlets).map(o => member(o, section, title)) });
test('selectEdition midday: 8 at most, single-outlet stories capped at 4, no filler', () => {
  const stories = [story('S1', 3, 'politics'), story('S2', 3, 'economy'), ...Array.from({ length: 10 }, (_, i) => story('X' + i, 1, ['news', 'world', 'sport', 'economy', 'security'][i % 5]))];
  const r = selectEdition(stories, { slot: 'midday', main: 8 });
  assert.equal(r.length, 6);
  assert.equal(r.filter(x => x.outlets === 1).length, 4);
  assert.ok(r.every(x => x.kind === 'new' && x.pick && x.pick.full_ok));
});
test('selectEdition: a story with a full article returns only as a development (+2 outlets), at most 2', () => {
  const full = new Map([['K1', { full_outlets: 2, full_title_he: 'הכנסת אישרה את התקציב' }], ['K2', { full_outlets: 2, full_title_he: 'שביתה כללית במשק' }],
    ['K3', { full_outlets: 1, full_title_he: 'סערה בחיפה' }], ['K4', { full_outlets: 1, full_title_he: 'רעידת אדמה' }]]);
  const k = (id, n, title, total) => ({ ...story(id, n, 'news', title), outlets_total: total });
  const r = selectEdition([k('K1', 2, 'הכנסת אישרה את התקציב סופית', 4), k('K2', 1, 'שביתה כללית במשק נמשכת', 3), k('K3', 2, 'סערה בחיפה גברה', 3), k('K4', 2, 'רעידת אדמה הורגשה', 3)],
    { slot: 'evening', main: 8, full });
  assert.equal(r.length, 2);
  assert.ok(r.every(x => x.kind === 'development'));
  assert.ok(!r.some(x => x.story.id === 'K2'));
});
test('selectEdition: one rubric gives at most 3 of the day editions', () => {
  const r = selectEdition(Array.from({ length: 6 }, (_, i) => story('P' + i, 3, 'politics')), { slot: 'late', main: 8 });
  assert.equal(r.length, 3);
});
test('selectEdition morning keeps the rubric quota and total 22', () => {
  const secs = ['politics', 'security', 'news', 'economy', 'world', 'culture', 'opinion'];
  const stories = Array.from({ length: 60 }, (_, i) => story('M' + i, 1 + (i % 3), secs[i % 7]));
  const r = selectEdition(stories, { slot: 'morning', main: 22 });
  assert.equal(r.length, 22);
  // the same picks as the pre-editions morning selection (quotas add up to 23 for 22 places)
  const { selectStories } = require('../news/harvest/newsStories');
  assert.deepEqual(r.map(x => x.story.id), selectStories(stories, { total: 22 }).map(x => x.story.id));
});

module.exports = { openDb, MIGRATIONS };
