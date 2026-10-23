'use strict';
// Ф3б (docs/planning/word-layer/F3B_BUILD_AND_EXPORT_SPEC_2026_10_12.md): one row identity for the
// table on screen and the stored card, the paid v1 entries carried to v2, and the portable layer that
// travels with an export — every imported entry re-proved against its own row.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const StudioImportCore = require('../public/js/studio-import.js');

// ── a minimal IndexedDB: one database, object stores keyed out of line ──
function fakeIndexedDB() {
  const dbs = new Map();
  const later = (fn) => setTimeout(fn, 0);
  function database(stores) {
    return {
      objectStoreNames: { contains: (n) => stores.has(n) },
      createObjectStore(n) { stores.set(n, new Map()); },
      transaction(name) {
        const tx = { oncomplete: null, onerror: null, onabort: null };
        let pending = 0, done = false;
        const finish = () => { if (!done && pending === 0) { done = true; later(() => tx.oncomplete && tx.oncomplete()); } };
        tx.objectStore = () => {
          const st = stores.get(name);
          return {
            get(k) { const r = {}; pending++; later(() => { r.result = st.has(k) ? structuredClone(st.get(k)) : undefined; r.onsuccess && r.onsuccess(); pending--; finish(); }); return r; },
            put(v, k) { st.set(k, structuredClone(v)); },
          };
        };
        later(finish);
        return tx;
      },
    };
  }
  return {
    open(name) {
      const rq = {};
      later(() => {
        let stores = dbs.get(name);
        const fresh = !stores;
        if (fresh) { stores = new Map(); dbs.set(name, stores); }
        rq.result = database(stores);
        if (fresh && rq.onupgradeneeded) rq.onupgradeneeded();
        rq.onsuccess && rq.onsuccess();
      });
      return rq;
    },
    _raw: (name, store) => dbs.get(name) && dbs.get(name).get(store),
  };
}

const { window, document } = parseHTML('<!doctype html><html><body><div id="m"></div></body></html>');
global.window = window; global.document = document;
window.indexedDB = global.indexedDB = fakeIndexedDB();
window.ReaderMorph = require('../public/js/reader-morph.js');
window.WordGloss = { glossFor: async () => ({ text: 'словарь' }) };
window.geminiKeyGet = () => 'AIza-test-key';
require('../public/js/word-gloss-ai.js');
const AI = window.WordGlossAI;
const RM = window.ReaderMorph;

// the device store (opened on first use) and a clean slate between tests
async function deviceStore() {
  if (!window.indexedDB._raw('lp-word-gloss-ai', 'rows')) { await AI.estimateDataRows([{ he_niqqud: 'א', ru: '' }]); await new Promise((r) => setTimeout(r, 5)); }
  return window.indexedDB._raw('lp-word-gloss-ai', 'rows');
}
async function reset() { (await deviceStore()).clear(); AI._mem.clear(); }

const ROW = { order_index: 0, he_plain: 'למה צריכים מאות מקומות', he_niqqud: 'לָמָּה צְרִיכִים מֵאוֹת מְקוֹמוֹת', ru: 'Зачем нужны сотни мест?' };
const GLOSSES = [{ gloss: 'зачем' }, { gloss: 'нужны' }, { gloss: 'сотни' }, { gloss: 'мест' }];

test('hiding the translation column preserves the bound occurrence and its saved manual gloss', async () => {
  await reset();
  const row = { ...ROW, id: 'hidden-translation' }, tr = renderRow(row, false);
  const key = AI.rowPayloadFromData(row).key;
  await AI.remember({ schema: AI.LAYER_SCHEMA, rows: [{ order_index: 0, key,
    glosses: GLOSSES.map((g, i) => i ? g : { gloss: 'моя правка', manual: true, ai_gloss: g.gloss }), mwe: [] }] }, [row]);
  tr.querySelector('td[data-col="ru"]').remove();
  AI.bindRows(document.getElementById('m'), [row]);
  assert.equal(AI.rowPayload(tr).storageKey, AI.rowPayloadFromData(row).storageKey);
  await AI.hydrate([tr]); assert.equal(AI.wordAt(tr, 0).gloss, 'моя правка');
  AI.bindRows(document.getElementById('m'), [{ ...row, ru: 'изменённый перевод' }]);
  await AI.hydrate([tr]); assert.equal(AI.wordAt(tr, 0), null, 'new source content cannot inherit the old correction');
});

test('duplicate occurrences retain distinct imported glosses through reload, reorder and portable rebind', async () => {
  await reset();
  const rows = [{ ...ROW, id: 'first', order_index: 0 }, { ...ROW, id: 'second', order_index: 1 }];
  const key = AI.rowPayloadFromData(rows[0]).key;
  const layer = { schema: AI.LAYER_SCHEMA, rows: rows.map((r, i) => ({
    order_index: i, key, model: 'imported AI', glosses: GLOSSES.map(g => ({ gloss: g.gloss + i })), mwe: []
  })) };
  await AI.remember(layer, rows);
  assert.equal((await AI.wordAtData(rows[0], 0)).gloss, 'зачем0');
  assert.equal((await AI.wordAtData(rows[1], 0)).gloss, 'зачем1');
  AI._mem.clear();
  assert.equal((await AI.wordAtData({ ...rows[0], order_index: 1 }, 0)).gloss, 'зачем0', 'stable identity survives reorder');
  assert.equal((await AI.wordAtData({ ...rows[1], order_index: 0 }, 0)).gloss, 'зачем1');
  assert.equal(await AI.wordAtData({ ...rows[0], ru: 'изменено' }, 0), null, 'edited content does not inherit old result');
  const exported = await AI.portable(rows);
  await reset();
  const rebound = rows.map((r, i) => ({ ...r, id: 'new-device-' + i }));
  await AI.remember(exported, rebound);
  assert.equal((await AI.wordAtData(rebound[0], 0)).gloss, 'зачем0');
  assert.equal((await AI.wordAtData(rebound[1], 0)).gloss, 'зачем1');
});

test('bound manual correction affects only one occurrence, survives reimport and keeps paid common cache', async () => {
  await reset();
  const rows = [{ ...ROW, id: 'first', order_index: 0 }, { ...ROW, id: 'second', order_index: 1 }];
  const key = AI.rowPayloadFromData(rows[0]).key;
  (await deviceStore()).set(key, { glosses: GLOSSES, mwe: [], model: 'paid' });
  const tr = renderRow(ROW, false);
  AI.bindRows(document.getElementById('m'), rows);
  await AI.hydrate([tr]);
  await AI.setOccurrenceGloss(tr, 0, 'для чего');
  assert.equal((await AI.wordAtData(rows[0], 0)).gloss, 'для чего');
  assert.equal((await AI.wordAtData(rows[1], 0)).gloss, 'зачем');
  const layer = { schema: AI.LAYER_SCHEMA, rows: rows.map((r, i) => ({ order_index: i, key, glosses: GLOSSES, mwe: [] })) };
  await AI.remember(layer, rows);
  assert.equal((await AI.wordAtData(rows[0], 0)).gloss, 'для чего');
  assert.equal((await deviceStore()).get(key).glosses[0].gloss, 'зачем', 'paid cache not overwritten');
});

test('draft corrections survive cloned render models and acquire saved IDs without leaking to repeated rows', async () => {
  await reset();
  const card=[{...ROW,order_index:0},{...ROW,order_index:1}];
  const render=rows=>{
    const first=renderRow(rows[0],false),second=first.cloneNode(true);
    second.setAttribute('data-row-idx','1');first.parentElement.appendChild(second);
    AI.bindRows(document.getElementById('m'),rows);
    return [first,second];
  };
  const key=AI.rowPayloadFromData(ROW).key;
  (await deviceStore()).set(key,{glosses:GLOSSES,mwe:[],model:'paid'});
  let trs=render(card);await AI.hydrate(trs);
  await AI.setOccurrenceGloss(trs[0],0,'для чего');
  const cloned=card.map(r=>{const next={...r};delete next._lpGlossOccurrenceId;return next;});
  trs=render(cloned);await AI.hydrate(trs);
  assert.equal(AI.wordAt(trs[0],0).gloss,'для чего');
  assert.equal(AI.wordAt(trs[1],0).gloss,'зачем');
  const Import=StudioImportCore;
  const saved=cloned.map((row,i)=>{
    const next={...row,id:'saved-'+i,edit_meta_json:Import.rowEditMetaForSave(row,null,i)};
    delete next._lpGlossOccurrenceId;return next;
  });
  AI._mem.clear();
  assert.equal((await AI.wordAtData(saved[0],0)).gloss,'для чего');
  assert.equal((await AI.wordAtData(saved[1],0)).gloss,'зачем');
  // A later Save as New carries the latest saved occurrence, not an older draft version.
  const first=renderRow(saved[0],false);AI.bindRows(document.getElementById('m'),saved);await AI.hydrate([first]);
  await AI.setOccurrenceGloss(first,0,'с какой целью');
  const copy={...saved[0],id:'copied',edit_meta_json:Import.rowEditMetaForSave(saved[0],null,0)};
  AI._mem.clear();
  assert.equal((await AI.wordAtData(copy,0)).gloss,'с какой целью');
});

// the table row as the shells render it: wrapped niqqud cell, translation cell + the media replay glyph
function renderRow(row, withReplay) {
  const m = document.getElementById('m');
  m.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
    '<td data-col="he">' + row.he_plain + '</td>' +
    '<td data-col="niqqud">' + RM.wrapCellHtml(row.he_niqqud, null) + '</td>' +
    '<td data-col="ru">' + row.ru + '</td></tr></tbody></table>';
  const tr = m.querySelector('tr');
  if (withReplay) {   // media-host renderRowReplay: nbsp + <button>▶︎</button>, appended later
    const td = tr.querySelector('td[data-col="ru"]');
    td.appendChild(document.createTextNode(' '));
    const b = document.createElement('button'); b.className = 'smk-row-replay'; b.textContent = '▶︎'; td.appendChild(b);
  }
  return tr;
}

test('row key: the stored row and the rendered row agree, with or without the replay glyph', () => {
  const fromData = AI.rowPayloadFromData(ROW);
  const plain = AI.rowPayload(renderRow(ROW, false));
  const media = AI.rowPayload(renderRow(ROW, true));
  assert.equal(fromData.key, plain.key);
  assert.equal(fromData.key, media.key, 'the ▶︎ button is not part of the translation');
  assert.equal(media.ru, ROW.ru, 'the glyph never reaches the prompt');
  assert.match(fromData.key, /^r2[0-9a-f]+:4$/);
  assert.deepEqual(fromData.words.map((w) => w.w), RM.words(ROW.he_niqqud));
});

test('row key: a machine-vocalized row keeps its key when he_niqqud travels in meta (text-card R9)', () => {
  const derived = { order_index: 0, hebrew_plain: ROW.he_plain, hebrew_niqqud: '', russian: ROW.ru,
    meta_json: JSON.stringify({ niqqud_derived: { value: ROW.he_niqqud } }) };
  assert.equal(AI.rowPayloadFromData(derived).key, AI.rowPayloadFromData(ROW).key);
});

test('a v1 entry paid on this device (keyed with the ▶︎ glyph) is found and moved to v2', async () => {
  const p = AI.rowPayloadFromData({ ...ROW, ru: 'Строка из прошлой версии' });
  const v1WithGlyph = p.legacy[1];
  await reset();
  const st = await deviceStore();
  st.set(v1WithGlyph, { glosses: GLOSSES, mwe: [], model: 'm' });
  const est = await AI.estimateDataRows([{ ...ROW, ru: 'Строка из прошлой версии' }]);
  assert.equal(est.coveredRows, 1);
  assert.equal(est.missingWords, 0);
  assert.ok(st.has(p.key), 'copied under the v2 key');
});

test('portable layer: export carries this card\'s rows; import re-proves every row', async () => {
  await reset();
  const card = [ROW, { order_index: 1, he_plain: 'שלום', he_niqqud: 'שָׁלוֹם', ru: 'Привет' }];
  const k0 = AI.rowPayloadFromData(card[0]).key;
  AI._mem.set(k0, { glosses: GLOSSES, mwe: [{ from: 2, to: 3, gloss: 'сотни мест' }], model: 'gemini-3.8-flash' });
  const layer = await AI.portable(card);
  assert.equal(layer.schema, 'word-gloss-ai-layer-v1');
  assert.equal(layer.rows.length, 1, 'only rows that have AI glosses');
  assert.equal(layer.rows[0].order_index, 0);

  await reset();
  const ok = await AI.remember(layer, card);
  assert.deepEqual(ok, { stored: 1, rejected: 0 });
  assert.equal(AI._mem.get(k0).glosses[2].gloss, 'сотни');

  // the same layer against an edited row, a forged entry and a word-count mismatch → rejected, not painted
  await reset();
  const edited = [{ ...ROW, ru: 'Другой перевод' }];
  assert.deepEqual(await AI.remember(layer, edited), { stored: 0, rejected: 1 });
  const forged = { schema: layer.schema, rows: [{ ...layer.rows[0], glosses: GLOSSES.slice(0, 3) }] };
  assert.deepEqual(await AI.remember(forged, card), { stored: 0, rejected: 1 });
  const badMwe = { schema: layer.schema, rows: [{ ...layer.rows[0], mwe: [{ from: 3, to: 9, gloss: 'x' }] }] };
  assert.deepEqual(await AI.remember(badMwe, card), { stored: 0, rejected: 1 });
  assert.equal(AI._mem.size, 0);
  assert.deepEqual(await AI.remember({ schema: 'other', rows: [1, 2] }, card), { stored: 0, rejected: 2 });
});

test('glossCard: sends only rows without glosses, once per content, and reports the card coverage', async () => {
  await reset();
  const sent = [];
  global.fetch = window.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(...body.rows.map((r) => r.ru));
    return { ok: true, status: 200, json: async () => ({ model: 'gemini-3.8-flash',
      rows: body.rows.filter((r) => r.ru !== 'Отказ').map((r) => ({ i: r.i, glosses: r.words.map((w) => ({ gloss: 'g:' + w.w })), mwe: [] })),
      rejected: body.rows.filter((r) => r.ru === 'Отказ').map((r) => ({ i: r.i })) }) };
  };
  const rows = [ROW, { ...ROW, order_index: 1 }, { order_index: 2, he_niqqud: 'שָׁלוֹם', ru: 'Отказ' }];
  const out = await AI.glossCard(rows, {});
  assert.deepEqual(sent, [ROW.ru, 'Отказ'], 'a repeated row is paid once; ▶︎-free translation sent');
  assert.equal(out.rows, 3);
  assert.equal(out.covered, 2);
  assert.equal(out.rejected, 1);
  assert.equal(out.error, '');
  sent.length = 0;
  const again = await AI.glossCard(rows, {});
  assert.deepEqual(sent, ['Отказ'], 'covered rows are never sent again');
  assert.equal(again.covered, 2);
});

test('glossCard without a Gemini key sends nothing and names the reason', async () => {
  await reset();
  const saved = window.geminiKeyGet; window.geminiKeyGet = () => '';
  let calls = 0; global.fetch = window.fetch = async () => { calls++; throw new Error('no'); };
  try {
    const out = await AI.glossCard([ROW], {});
    assert.equal(calls, 0);
    assert.equal(out.error, 'GEMINI_KEY_REQUIRED');
    assert.equal(out.covered, 0);
  } finally { window.geminiKeyGet = saved; }
});

// Ф3в: правка перевода ОДНОГО вхождения закреплена — запрос/импорт её не перезаписывают, оригинал ИИ
// сохраняется для «вернуть», правка едет в экспорт.
test('an occurrence correction is locked, exported, survives an import, and reverts to the AI gloss', async () => {
  await reset();
  const tr = renderRow(ROW, true);
  const p = AI.rowPayload(tr);
  AI._mem.set(p.key, { glosses: GLOSSES.map((g) => ({ ...g, wrong_hint: false })), mwe: [], model: 'm' });
  assert.equal(await AI.setOccurrenceGloss(tr, 2, '  сотня  '), true);
  let x = AI.wordAt(tr, 2);
  assert.deepEqual([x.gloss, x.manual, x.aiGloss], ['сотня', true, 'сотни']);
  const span = tr.querySelectorAll('td[data-col="niqqud"] .rm-w')[2];
  assert.equal(span.getAttribute('data-gloss-label'), 'user', 'the correction has the learner colour');

  // export carries it; an import of the plain AI layer does not overwrite the local correction
  const layer = await AI.portable([ROW]);
  assert.equal(layer.rows[0].glosses[2].manual, true);
  assert.equal(layer.rows[0].glosses[2].ai_gloss, 'сотни');
  const plain = { schema: layer.schema, rows: [{ ...layer.rows[0], glosses: GLOSSES.map((g) => ({ gloss: g.gloss + '!' })) }] };
  assert.deepEqual(await AI.remember(plain, [ROW]), { stored: 1, rejected: 0 });
  x = AI.wordAt(tr, 2);
  assert.equal(x.gloss, 'сотня', 'local correction wins over an imported AI layer');
  assert.equal(AI.wordAt(tr, 0).gloss, 'зачем!', 'other words take the imported layer');

  // on a fresh device the imported correction arrives as a correction
  await reset();
  assert.deepEqual(await AI.remember(layer, [ROW]), { stored: 1, rejected: 0 });
  x = AI.wordAt(tr, 2);
  assert.deepEqual([x.gloss, x.manual], ['сотня', true]);

  // revert
  assert.equal(await AI.setOccurrenceGloss(tr, 2, ''), true);
  x = AI.wordAt(tr, 2);
  assert.deepEqual([x.gloss, x.manual], ['сотни', false]);
  assert.equal(span.getAttribute('data-gloss-label'), 'ai');
  // a stored correction is kept on the device (IndexedDB), not only in memory
  await AI.setOccurrenceGloss(tr, 1, 'необходимы');
  AI._mem.clear();
  await AI.hydrate([tr]);
  assert.equal(AI.wordAt(tr, 1).gloss, 'необходимы');
});
