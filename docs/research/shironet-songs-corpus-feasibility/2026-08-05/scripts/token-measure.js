'use strict';
// Measure REAL Gemini token counts for each learning-table column, using the
// owner's own 77-song corpus as the sample. countTokens is a free endpoint.
const fs = require('fs');
const path = require('path');

// Project root: override with LP_ROOT if the repo lives elsewhere.
const envPath = path.join(process.env.LP_ROOT || path.join('E:', 'projects', 'tts-prototype-android'), '.env');
const env = fs.readFileSync(envPath, 'utf8');
const m = env.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
if (!m) { console.error('no GEMINI_API_KEY'); process.exit(1); }
const KEY = m[1].trim().replace(/^["']|["']$/g, '');

const MODEL = process.env.MODEL || 'gemini-flash-latest';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:countTokens?key=${KEY}`;

async function count(text) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return j.totalTokens;
}

(async () => {
  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'library.json'), 'utf8'));
  const songs = d.texts.filter((t) => /^Position \d+\./.test(t.title || ''));

  // duplicate-song sanity check
  const norm = (s) => (s || '').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim();
  const bodies = new Map();
  for (const s of songs) {
    const body = (s.rows || []).map((r) => norm(r.hebrew_plain)).join('\n');
    bodies.set(body, (bodies.get(body) || 0) + 1);
  }
  const dupSongs = [...bodies.values()].filter((v) => v > 1).length;
  console.log('identical-body song groups:', dupSongs, '/ distinct bodies:', bodies.size);

  // Sample 12 songs spread across the corpus for token measurement.
  const sample = [];
  for (let i = 0; i < 12; i++) sample.push(songs[Math.floor((i * songs.length) / 12)]);

  const agg = { he: 0, niqqud: 0, translit: 0, ru: 0, rows: 0, jsonFull: 0, jsonSlim: 0, jsonRuOnly: 0, chars: { he: 0, niqqud: 0, translit: 0, ru: 0 } };

  for (const s of sample) {
    const rows = (s.rows || []).filter((r) => (r.hebrew_plain || '').trim());
    const he = rows.map((r) => r.hebrew_plain).join('\n');
    const niqqud = rows.map((r) => r.hebrew_niqqud || '').join('\n');
    const translit = rows.map((r) => r.translit || '').join('\n');
    const ru = rows.map((r) => r.russian || '').join('\n');

    // What the CURRENT legacy prompt makes the model emit (segments[] + 4 fields).
    const full = JSON.stringify({
      segments: rows.map((r, i) => ({ index: i + 1, he: r.hebrew_plain })),
      rows: rows.map((r, i) => ({
        segment_index: i + 1, he: r.hebrew_plain, he_niqqud: r.hebrew_niqqud || '',
        translit: r.translit || '', ru: r.russian || '',
      })),
    });
    // Slim: no segments[], no he echo, no per-row keys — one record per line.
    const slim = rows.map((r) => [r.hebrew_niqqud || '', r.translit || '', r.russian || ''].join('|')).join('\n');
    // ru-only: niqqud + translit produced locally (Dicta + deterministic translit).
    const ruOnly = rows.map((r) => r.russian || '').join('\n');

    const [tHe, tNi, tTr, tRu, tFull, tSlim, tRuOnly] = await Promise.all([
      count(he), count(niqqud), count(translit), count(ru), count(full), count(slim), count(ruOnly),
    ]);
    agg.rows += rows.length;
    agg.he += tHe; agg.niqqud += tNi; agg.translit += tTr; agg.ru += tRu;
    agg.jsonFull += tFull; agg.jsonSlim += tSlim; agg.jsonRuOnly += tRuOnly;
    agg.chars.he += he.length; agg.chars.niqqud += niqqud.length;
    agg.chars.translit += translit.length; agg.chars.ru += ru.length;
    console.log(`${String(rows.length).padStart(3)} rows | he ${String(tHe).padStart(4)} | niq ${String(tNi).padStart(5)} | tr ${String(tTr).padStart(4)} | ru ${String(tRu).padStart(4)} | JSONfull ${String(tFull).padStart(5)} | slim ${String(tSlim).padStart(5)}  ${s.title.slice(0, 40)}`);
  }

  const n = 12;
  console.log('\n=== per-song averages over', n, 'songs (', (agg.rows / n).toFixed(1), 'rows/song ) ===');
  const per = (x) => (x / n).toFixed(0);
  console.log('input  he plain      :', per(agg.he), 'tok');
  console.log('output he_niqqud     :', per(agg.niqqud), 'tok');
  console.log('output translit (lat):', per(agg.translit), 'tok');
  console.log('output ru            :', per(agg.ru), 'tok');
  console.log('output JSON as today :', per(agg.jsonFull), 'tok  <-- current legacy prompt shape');
  console.log('output slim pipe-rows:', per(agg.jsonSlim), 'tok');
  console.log('output ru only       :', per(agg.jsonRuOnly), 'tok');
  console.log('\ntokens per char:');
  console.log('  he      ', (agg.he / agg.chars.he).toFixed(3));
  console.log('  niqqud  ', (agg.niqqud / agg.chars.niqqud).toFixed(3));
  console.log('  translit', (agg.translit / agg.chars.translit).toFixed(3));
  console.log('  ru      ', (agg.ru / agg.chars.ru).toFixed(3));

  fs.writeFileSync(path.join(process.cwd(), 'token-measure.json'), JSON.stringify({ model: MODEL, n, agg }, null, 1));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
