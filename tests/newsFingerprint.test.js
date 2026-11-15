'use strict';
// Fingerprints of the original per paragraph (docs/superpowers/specs/2026-11-15-news-editions-design.md §4.4, §5.5).
const test = require('node:test'), assert = require('node:assert/strict');
const { normalizeForPrint, fingerprintOf, diffPrints } = require('../news/newsFingerprint');

const P = ['ראש הממשלה נאם הערב בכנסת.', 'יו״ר האופוזיציה הגיב לדברים.', 'בתום הדיון הצביעו חברי הכנסת.'];

test('fingerprint: quotes, geresh, spaces and punctuation do not make a change', () => {
  assert.equal(normalizeForPrint('אמר "שלום"  לכולם.'), normalizeForPrint('אמר ״שלום״ לכולם'));
  assert.equal(normalizeForPrint('צ\'ילה'), normalizeForPrint('צ׳ילה'));
  assert.equal(normalizeForPrint('הַכְּנֶסֶת'), normalizeForPrint('הכנסת'), 'vowels do not count');
  const a = fingerprintOf('נתניהו נאם בכנסת', P), b = fingerprintOf('נתניהו נאם בכנסת.', P.map(p => p.replace('.', ' .')));
  assert.deepEqual(diffPrints(a, b), { added: 0, changed: 0, removed: 0, title_changed: false, significant: false });
  assert.match(a.title_hash, /^[0-9a-f]{16}$/); assert.equal(a.para_hashes.length, 3);
});
test('diffPrints: 4 new paragraphs and a new title', () => {
  const a = fingerprintOf('נתניהו נאם בכנסת', P);
  const b = fingerprintOf('נתניהו נאם בכנסת: תגובות', [...P, 'פסקה חדשה ראשונה.', 'פסקה חדשה שנייה.', 'פסקה חדשה שלישית.', 'פסקה חדשה רביעית.']);
  assert.deepEqual(diffPrints(a, b), { added: 4, changed: 0, removed: 0, title_changed: true, significant: true });
});
test('diffPrints: one paragraph reworded counts as changed, not added+removed', () => {
  const a = fingerprintOf('כותרת', P), b = fingerprintOf('כותרת', [P[0], 'יו״ר האופוזיציה תקף את הדברים בחריפות.', P[2]]);
  assert.deepEqual(diffPrints(a, b), { added: 0, changed: 1, removed: 0, title_changed: false, significant: true });
});
test('ingest stores a fingerprint for an OR article', async t => {
  const { openDb } = require('./helpers/newsDb.cjs');
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack, studyRows, glossFor, SOURCE } = require('./helpers/newsFixture.cjs');
  const C = require('../news/newsPackCore');
  const db = await openDb(['084_news_fingerprints.sql']); t.after(() => db.close());
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00') });
  const rows = studyRows([{ p: 1, he_plain: SOURCE.split(' ').slice(0, 17).join(' ') + '.', ru: 'Первая часть.' }, { p: 2, he_plain: SOURCE.split(' ').slice(17).join(' ') + '.', ru: 'Вторая часть.' }]);
  const src = SOURCE.split(' ').slice(0, 17).join(' ') + '.\n\n' + SOURCE.split(' ').slice(17).join(' ') + '.';
  const a = fixtureArticle({ learning: { versions: [{ level: 'OR', rows, word_gloss_ai: 'or.word-gloss-ai.json' }] }, prepared: { method: 'original' },
    check: { source_shingles: C.shingles(src), source_word_count: src.split(/\s+/).length }, __files: { 'or.word-gloss-ai.json': glossFor(rows) } });
  const r = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([a]));
  assert.equal(r.totals.published, 1, JSON.stringify(r.items));
  const fp = await new Promise((res, rej) => db.get('SELECT * FROM news_article_fingerprints', (e, x) => e ? rej(e) : res(x)));
  assert.equal(fp.article_id, r.items[0].article_id);
  assert.equal(JSON.parse(fp.para_hashes_json).length, 2);
  assert.equal(fp.url, 'https://www.ynet.co.il/news/article/abc123');
});
