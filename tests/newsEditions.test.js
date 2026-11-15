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

module.exports = { openDb, MIGRATIONS };
