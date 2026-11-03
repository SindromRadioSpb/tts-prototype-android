'use strict';
// Atlas P5 G3 — an atlas term (at1:<atlas>:<term>#<sense>) is reviewed in the atlas, not as a word: the server's word
// views (due, weak, struggles, upcoming, agent counts, mentor context) never serve or count it (final review 2026-11-03).
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const sqlite = require('../db/sqlite'), Log = require('../db/learnerLogRepo'), Projection = require('../db/learnerProjectionRepo');
const Graph = require('../db/learnerGraphRepo');
const row = (id, key, day, kind, grade) => ({ id, item_key: key, reviewed_at: `2026-11-0${day}T10:00:00.000Z`, kind, source: 'atlas-term', grade: grade ?? null, meta_json: '{}' });

test('atlas terms are not words on the server: due, weak, struggles, upcoming and the agent counts skip them', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-atlas-term-'));
  t.after(async () => { await sqlite.closeDb(); fs.rmSync(root, { recursive: true, force: true }); });
  await sqlite.initDb(path.join(root, 'app.db'));
  await sqlite._exec(sqlite.getDb(), "CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('u');");
  for (const m of ['021_cloud_event_log.sql', '022_srs_projections.sql', '025_channel_stats.sql'])
    await sqlite._exec(sqlite.getDb(), fs.readFileSync(path.join(__dirname, '../migrations', m), 'utf8'));
  const word = 'pid:1612', term = 'at1:a97002:belt#belt';
  const rows = [row('w1', word, 1, 'review', 1), row('w2', word, 2, 'review', 1), row('w3', word, 3, 'review', 3),
    row('t1', term, 1, 'review', 1), row('t2', term, 2, 'review', 1), row('t3', term, 3, 'review', 1)];
  const res = await Log.ingestBatch('u', 'dev', { idempotency_key: 'k1', review_log: rows });
  assert.equal(res.review_log.new, rows.length, 'the log keeps the term rows (memory canon)');
  await Projection.recomputeForKeys('u', res.new_item_keys);
  const keys = (list) => (list || []).map((x) => x.item_key);
  const far = Date.parse('2027-06-01T00:00:00Z'), early = Date.parse('2026-11-03T10:00:01Z'), since = Date.parse('2026-10-31T00:00:00Z');
  assert.deepEqual(keys(await Graph.getDue('u', { nowMs: far })), [word]);
  assert.deepEqual(keys(await Graph.getWeakWords('u', { limit: 5 })), [word]);
  assert.deepEqual(keys(await Graph.getRecentStruggles('u', { sinceMs: since, minFails: 2 })), [word]);
  assert.deepEqual([...(await Graph.recentStruggleKeySet('u', { sinceMs: since, minFails: 2 }))], [word]);
  assert.ok(!keys(await Graph.getUpcoming('u', { nowMs: early })).includes(term));
  const agg = await Graph.getAgentAccessReviewAggregates('u', { nowMs: far });
  assert.equal(agg.scheduled_total, 1);
  assert.equal(agg.due_total, 1);
  const ctx = await Graph.getAgentContext('u', { nowMs: far });
  assert.equal(ctx.counts.scheduled, 1, 'scheduled counts words only');
  assert.equal(ctx.counts.due_now, 1);
});
