// BRR-P1-007 §7 — REAL-PROFILE validation (privacy-preserving, on-device).
//
// This is a BROWSER CONSOLE snippet, not a Node script. The reader's i+1 profile lives in
// their browser OPFS (getKnownWordStates) and never leaves the device — so the validation
// must run THERE. It reuses window.CorpusVocabRoom.coverageFor(id), which already returns,
// per work, the matched-token / all-token / type coverages + fallback share against the LIVE
// profile, and aggregates ONLY anonymous counts (never which lemmas are known). The owner
// pastes it into the console on https://linguistpro.kolosei.com/library.html AFTER opening the
// «Корпус» tab, then sends back the printed report. I interpret → recalibrate CV.CFG.
//
// Answers DESIGN §7: (1) in-zone count under matched-only vs all-token (the denominator that
// the recon showed flips the picture); (2) token vs type coverage; (3) per-era fallback load;
// plus the matched-token coverage distribution + in-zone counts at candidate bands so the
// 80–95% zone can be recalibrated to the real profile. Sequential (no query stampede).

(async () => {
  const CV = window.CorpusVocab, Room = window.CorpusVocabRoom;
  if (!CV || !Room) { console.log('⚠ Открой вкладку «Корпус» в Читальном зале и запусти снова.'); return; }
  const V = 7;
  const vocab = await Room.ensure();
  if (!vocab || !vocab.works) { console.log('⚠ vocab sidecar не загрузился'); return; }
  let eraById = {};
  try {
    const s = await (await fetch('/data/benyehuda/corpus-search-v' + V + '.json?v=' + V, { cache: 'force-cache' })).json();
    for (const r of s) eraById[String(r.id)] = r.e || 'unknown';
  } catch (e) {}

  const ids = Object.keys(vocab.works);
  const rows = [];
  for (const id of ids) {                          // SEQUENTIAL — one shared states query, no stampede
    const c = await Room.coverageFor(id);
    if (!c || c.matchedDistinct < 20) continue;    // skip too-short (matches the recon)
    rows.push({
      mt: c.matchedDrillCov,                       // matched-only, token-weighted (drives the rail)
      at: c.totalCov,                              // all-token (reading-load denominator)
      ty: c.matchedDistinct ? c.knownDistinct / c.matchedDistinct : 0, // matched-only, TYPE
      fb: c.fallbackShare, known: c.knownDistinct, era: eraById[id] || 'unknown',
    });
  }
  const N = rows.length;
  if (!N) { console.log('Нет работ для оценки (профиль пуст?).'); return; }

  const LO = CV.CFG.ZONE_LO, HI = CV.CFG.ZONE_HI;
  const inBand = (key, lo, hi) => rows.filter((r) => r[key] >= lo && r[key] < hi).length;
  const ge = (key, hi) => rows.filter((r) => r[key] >= hi).length;
  const lt = (key, lo) => rows.filter((r) => r[key] < lo).length;
  const pcts = (key) => { const a = rows.map((r) => r[key]).sort((x, y) => x - y); return [10, 25, 50, 75, 90].map((p) => a[Math.min(a.length - 1, Math.floor(a.length * p / 100))].toFixed(2)).join('/'); };
  const engaged = rows.filter((r) => r.known > 0).length;
  const eras = {};
  for (const r of rows) { const e = eras[r.era] = eras[r.era] || { n: 0, fb: 0, in: 0 }; e.n++; e.fb += r.fb; if (r.mt >= LO && r.mt < HI) e.in++; }
  const bands = [[.80, .95], [.75, .95], [.75, .90], [.70, .90], [.70, .85], [.65, .85]];

  let R = '';
  R += '=== BRR-P1-007 §7 real-profile validation ===\n';
  R += 'scored=' + N + ' works (matchedDistinct≥20) · engaged(≥1 known lemma)=' + engaged + '\n';
  R += 'current zone ' + LO + '–' + HI + ' · IN-ZONE under three lenses:\n';
  R += '  matched-only token : in=' + inBand('mt', LO, HI) + ' easy=' + ge('mt', HI) + ' hard=' + lt('mt', LO) + '\n';
  R += '  all-token          : in=' + inBand('at', LO, HI) + ' easy=' + ge('at', HI) + ' hard=' + lt('at', LO) + '\n';
  R += '  matched-only TYPE  : in=' + inBand('ty', LO, HI) + ' easy=' + ge('ty', HI) + ' hard=' + lt('ty', LO) + '\n';
  R += 'matched-token cov pct (p10/25/50/75/90): ' + pcts('mt') + '\n';
  R += 'in-zone count at candidate bands (matched-token):\n';
  for (const [lo, hi] of bands) R += '  [' + lo + '–' + hi + '] = ' + inBand('mt', lo, hi) + '\n';
  R += 'per-era (fb% = proper-noun/archaic load · in@current-zone):\n';
  for (const e of Object.keys(eras).sort((a, b) => eras[b].n - eras[a].n)) R += '  ' + e.padEnd(9) + ' n=' + eras[e].n + ' fb=' + (100 * eras[e].fb / eras[e].n).toFixed(0) + '% in=' + eras[e].in + '\n';

  console.log(R);
  try { await navigator.clipboard.writeText(R); console.log('✅ Скопировано в буфер — пришли мне этот текст.'); }
  catch (e) { console.log('☝ Выдели текст выше и пришли мне.'); }
})();
