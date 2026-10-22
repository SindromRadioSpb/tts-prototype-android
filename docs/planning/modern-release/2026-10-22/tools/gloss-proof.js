// Re-proves every archive AI-layer row with the live client code (reader-morph.js + word-gloss-ai.js).
// Usage: node gloss-proof.js <repo> <library-root> <out.json>
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const [repo, root, outFile] = process.argv.slice(2);
const AdmZip = require('E:/projects/tts-prototype-android/node_modules/adm-zip');
const Archive = require(path.join(repo, 'publication', 'materialArchive.js'));

const noop = () => {};
const el = () => ({ addEventListener: noop, setAttribute: noop, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], classList: { add: noop, remove: noop }, style: {} });
const win = { addEventListener: noop, removeEventListener: noop, document: { addEventListener: noop, createElement: el, querySelector: () => null, querySelectorAll: () => [], body: el(), documentElement: el(), readyState: 'complete' }, localStorage: { getItem: () => null, setItem: noop }, navigator: { language: 'ru' }, location: { search: '', hash: '' }, console, setTimeout, clearTimeout, crypto: globalThis.crypto };
win.window = win; win.self = win; win.globalThis = win;
const ctx = vm.createContext(win);
for (const f of ['public/js/reader-morph.js', 'public/js/word-gloss-ai.js']) {
  vm.runInContext(fs.readFileSync(path.join(repo, f), 'utf8'), ctx, { filename: f });
}
const W = win.WordGlossAI;
if (!W || !win.ReaderMorph) throw new Error('client modules did not load');

function* zips(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'AntiGravity') yield* zips(p); } else if (e.name.endsWith('.zip')) yield p;
  }
}
const out = []; const total = { texts: 0, layerRows: 0, keyOk: 0, keyBad: 0, validBad: 0, mediathequeKept: 0 };
for (const z of zips(root)) {
  let zip; try { zip = new AdmZip(z); } catch { continue; }
  const e = zip.getEntries().find(x => x.entryName.endsWith('library.json'));
  if (!e) continue;
  const lib = JSON.parse(e.getData().toString('utf8'));
  for (const t of lib.texts || []) {
    const L = t.word_gloss_ai_layer; if (!L) continue;
    total.texts++;
    const byOrder = new Map((t.rows || []).map((r, i) => [Number.isFinite(Number(r.order_index)) ? Number(r.order_index) : i, r]));
    let ok = 0, bad = 0, badSamples = [];
    for (const lr of L.rows || []) {
      const p = byOrder.has(Number(lr.order_index)) ? W.rowPayloadFromData(byOrder.get(Number(lr.order_index))) : null;
      if (p && p.key === lr.key && lr.glosses.length === p.words.length) ok++; else { bad++; if (badSamples.length < 2) badSamples.push({ order: lr.order_index, archive: lr.key, client: p && p.key, glosses: lr.glosses.length, words: p && p.words.length }); }
    }
    const kept = Archive.wordGlossLayer(L, (t.rows || []).length);
    total.layerRows += (L.rows || []).length; total.keyOk += ok; total.keyBad += bad; total.mediathequeKept += kept ? kept.rows.length : 0;
    out.push({ zip: path.relative(root, z), title: t.title, rows: (t.rows || []).length, layerRows: (L.rows || []).length, keyOk: ok, keyBad: bad, mediathequeKept: kept ? kept.rows.length : 0, badSamples });
  }
}
fs.writeFileSync(outFile, JSON.stringify({ total, texts: out }, null, 1));
console.log(JSON.stringify(total));
const worst = out.filter(x => x.keyBad || x.mediathequeKept < x.layerRows).sort((a, b) => b.keyBad - a.keyBad).slice(0, 12);
for (const w of worst) console.log(JSON.stringify({ zip: w.zip.slice(-60), layer: w.layerRows, ok: w.keyOk, bad: w.keyBad, medKept: w.mediathequeKept, s: w.badSamples[0] }));
