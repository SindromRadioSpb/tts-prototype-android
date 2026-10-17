'use strict';
// O-091: the first tap in a corpus work just opened must read the word at its place — the tap waits (bounded) for
// the work's baked Dicta parse instead of answering with the spelling's reading and fetching the parse for the second tap.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const realSetTimeout = global.setTimeout;
global.setTimeout = (f, ms, ...a) => { const t = realSetTimeout(f, ms, ...a); if (ms >= 10000 && t.unref) t.unref(); return t; };

const RM = require('../public/js/reader-morph.js');
const CPP = require('../public/js/corpus-place-parse.js');
const h16 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

function world() {
  const texts = new Map(), sentences = new Map(), morph = new Map(), files = new Map();
  const add = (id, byId, rows, facts) => {
    const key = crypto.createHash('sha256').update(id).digest('hex');
    texts.set(id, { id, text_key: key, source_meta_json: JSON.stringify({ corpus: { byehuda_id: byId } }) });
    rows.forEach((plain, i) => sentences.set(id + ':' + i, { id: id + ':' + i, text_id: id, order_index: i, he_plain: plain, he_niqqud: '', text_key: key }));
    files.set('/data/corpus-parse/by/' + key + '.json', { v: 1, model: 'm', src: { kind: 'by', id: byId, edition: key }, rows: rows.map((p, i) => [h16(p), i, facts[i]]) });
  };
  const inIds = (p) => p.map(String);
  const ldb = {
    dbQuery: async (sql, p) => {
      if (/FROM sentences s LEFT JOIN texts/.test(sql)) return inIds(p).map((id) => sentences.get(id)).filter(Boolean);
      if (/SELECT sentence_id, tokens_json FROM sentence_morph WHERE sentence_id IN/.test(sql)) return inIds(p).filter((id) => morph.has(id)).map((id) => ({ sentence_id: id, tokens_json: JSON.stringify(morph.get(id).tokens) }));
      if (/FROM texts WHERE id IN|FROM texts WHERE id = \?/.test(sql)) return inIds(p).map((id) => texts.get(id)).filter(Boolean);
      if (/COUNT\(\*\) AS n FROM sentence_morph WHERE text_id/.test(sql)) return [{ n: [...morph.values()].filter((m) => m.tid === p[0] && m.provider === p[1]).length }];
      if (/FROM sentences s WHERE s.text_id/.test(sql)) return [...sentences.values()].filter((s) => s.text_id === p[0]).slice(p[2], p[2] + p[1]).map((s) => Object.assign({}, s, { has: morph.has(s.id) ? 1 : 0 }));
      throw new Error('unexpected sql ' + sql);
    },
    saveSentenceMorphIfAbsent: async (tid, sid, model, tokens, provider) => { if (!morph.has(sid)) morph.set(sid, { tid, tokens, provider }); },
  };
  const store = new Map();
  global.window = {
    CorpusPlaceParse: CPP,
    ReaderMorph: Object.assign({}, RM, { setPlaceLoader: (fn) => { world.loader = fn; } }),
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    dispatchEvent: () => true,
  };
  global.localStorage = global.window.localStorage;
  global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
  global.fetch = async (url) => { const f = files.get(url); return { ok: !!f, status: f ? 200 : 404, json: async () => f }; };
  global.window.fetch = global.fetch;
  return { add, ldb, morph };
}

test('the first tap in a just-opened corpus work waits for its parse; the paint never waits', async () => {
  const w = world();
  const facts = [[['בשעה', 'שעה', [], 'noun', 'בְּשָׁעָה', '', 'ב'], ['שקטה', 'שקט', [], 'adjective', '', '', '']]];
  w.add('w1', '43405', ['בשעה שקטה'], facts);
  w.add('w2', '43406', ['בשעה שקטה'], facts);
  delete require.cache[require.resolve('../public/js/morph-host.js')];
  const MH = require('../public/js/morph-host.js');
  const host = MH.createHost({ ldb: async () => w.ldb });
  const load = world.loader;
  assert.equal(typeof load, 'function');

  // the paint (no wait): the spelling's reading now, the parse fetched in the background
  const painted = await load(['w2:0']);
  assert.equal(painted.get('w2:0').at.size, 0);

  // a tap: its own work first, then the stored parse is read again — the place is there at once
  const t0 = Date.now();
  const tapped = await load(['w1:0'], { wait: 4000 });
  assert.equal(tapped.get('w1:0').at.get(0).lemma, 'שעה');
  assert.ok(Date.now() - t0 < 4000, 'bounded');
  assert.equal(w.morph.get('w1:0').provider, 'corpus-dicta');

  // an opened work starts its parse with the open (the queue's front)
  w.add('w3', '43407', ['בשעה שקטה'], facts);
  await host.corpusParseSoon('w3');
  const third = await load(['w3:0'], { wait: 4000 });
  assert.equal(third.get('w3:0').at.size, 2);
});
