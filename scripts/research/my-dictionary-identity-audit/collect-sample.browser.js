// «Мой словарь» — independent identity audit, step 1 (protocol: docs/research/my-dictionary-identity-audit/2026-10-16/PROTOCOL.md).
// Runs IN the learner's own LinguistPro tab (read-only: SELECTs and the scan the cards already do — no writes).
// Paste/evaluate the whole file; it starts in the background and reports on window.__identityAudit.
// Every text is scanned exactly as its card is (TextKeyScan.scanLens: Dicta lexicon, name decisions, the word layer's
// «имя:» hints, ReaderMorph.scanRows); each word's key comes from the scan, its path from resolveOffline/resolveCore.
(function () {
  "use strict";
  if (window.__identityAudit && window.__identityAudit.state === "run") return "already running";
  var SEED = 20261016;
  var QUOTA = { S1: 60, S2: 50, S3: 60, S4: 50, S5: 50, S6: 30 };
  var A = window.__identityAudit = { state: "run", started: new Date().toISOString(), seed: SEED, quota: QUOTA,
    texts: 0, textsDone: 0, rows: 0, tokens: 0, counts: { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, func: 0, other: 0 },
    sample: { S1: [], S2: [], S3: [], S4: [], S5: [], S6: [] }, errors: [], version: window.APP_VERSION || "" };
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = mulberry32(SEED);
  // a hidden tab clamps setTimeout(0) to ≥ 1 s (and to once a minute after 5 min) — the scan yields that way; for the
  // audit only, zero-delay timeouts run on a MessageChannel (restored at the end)
  var nativeST = window.setTimeout, mc = new MessageChannel(), q = [];
  mc.port1.onmessage = function () { var f = q.shift(); if (f) f(); };
  window.setTimeout = function (fn, ms) { if (!ms && typeof fn === "function") { var args = Array.prototype.slice.call(arguments, 2); q.push(function () { fn.apply(null, args); }); mc.port2.postMessage(0); return 0; } return nativeST.apply(window, arguments); };
  function reservoir(stratum, item) {
    var n = A.counts[stratum], k = QUOTA[stratum], s = A.sample[stratum];
    if (s.length < k) s.push(item);
    else { var j = Math.floor(rnd() * n); if (j < k) s[j] = item; }
  }
  (async function () {
    try {
      var url = performance.getEntriesByType("resource").map(function (e) { return e.name; }).find(function (n) { return /\/db\/local-db\.js/.test(n); });
      var db = await import(url), R = window.ReaderMorph, TKS = window.TextKeyScan;
      if (!R || !TKS) throw new Error("ReaderMorph/TextKeyScan missing");
      var eng = await R.ensureEngine();
      await TKS.ensureLexicon(db);
      A.scanVersion = TKS.SCAN_VERSION; A.generation = await TKS.generation(db);
      var texts = await db.dbQuery("SELECT id, text_key, title FROM texts ORDER BY id", []);
      A.texts = texts.length;
      for (var ti = 0; ti < texts.length; ti++) {
        var t = texts[ti];
        var rows = await db.getSentences(String(t.id));
        if (!rows || !rows.length) { A.textsDone++; continue; }
        var T = { texts: [{ id: String(t.id), key: t.text_key || String(t.id), from: 0, n: rows.length }], rows: rows, rowText: rows.map(function () { return 0; }) };
        var res = await TKS.scanLens(db, T), scan = res.scan;
        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri], keys = scan.rowKeys[ri] || [];
          A.rows++;
          var plain = String(row.he_plain != null ? row.he_plain : row.he || ""), vocal = String(row.he_niqqud || ""), toks, pairs;
          if (plain) { var al = R.alignSurfaceNiqqud(plain, vocal), w = 0; toks = R.tokenize(plain); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { var a = al[w++] || {}; return [a.surface || x.text, a.niqqud || ""]; }); }
          else { toks = R.tokenize(vocal); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { return [R.stripNiqqud(x.text), x.text]; }); }
          var units = R.joinSplitWords(toks, pairs) || [];
          for (var k = 0; k < units.length; k++) {
            var un = units[k];
            if (un.fragment) continue;
            A.tokens++;
            var key = keys[un.off] || null, sk = R.stripNiqqud(un.surface || un.niqqud), stratum, base = null, card = null, u = null;
            if (key) {
              base = await R.resolveOffline(eng, un.surface, un.niqqud);
              card = await R.resolveCore(eng, un.surface, un.niqqud);
              var via = (card && card.identityVia) || "";
              if (via === "form-canonical") stratum = "S3";
              else if (via === "dicta-lexicon" || via === "dicta-confirmed") stratum = "S4";
              else if (base && base.label === "exact") stratum = "S1";
              else stratum = "S2";
            } else {
              u = scan.unsure.get(sk);
              var f = scan.func.get(sk);
              if (u && !f) stratum = u.nameSuspect ? "S6" : "S5";
              else if (f && !u) stratum = "func";
              else if (u && f) { card = await R.resolveCore(eng, un.surface, un.niqqud); stratum = card && card.label === "function" ? "func" : (u.nameSuspect ? "S6" : "S5"); }
              else stratum = "other";
            }
            A.counts[stratum]++;
            if (!QUOTA[stratum]) continue;
            reservoir(stratum, {
              stratum: stratum, text_id: String(t.id), text_title: String(t.title || ""), sentence_id: String(row.id), order_index: row.order_index, offset: un.off,
              surface: un.surface, niqqud: un.niqqud, sentence_plain: plain, sentence_niqqud: vocal, key: key,
              base_label: base ? base.label : (u ? u.label : ""), label: card ? card.label : (u ? u.label : ""), via: card ? (card.identityVia || "") : "",
              lemma: card ? (card.lemma || "") : "", pos: card ? (card.pos || "") : (u ? u.pos : ""), pealim_id: card ? String(card.pealim_id || "") : "",
              meaning: card ? (card.meaning || "") : "", root: card ? (card.root || "") : "", binyan: card ? (card.binyan || "") : "",
              ambiguous: card ? !!card.ambiguous : false, name_suspect: u ? !!u.nameSuspect : false, dicta_lemma: card && card.label === "dicta" ? card.lemma : "",
            });
          }
        }
        A.textsDone++;
      }
      A.state = "done";
    } catch (e) { A.state = "error"; A.errors.push(String(e && e.stack || e)); }
    finally { window.setTimeout = nativeST; A.finished = new Date().toISOString(); }
  })();
  return "started";
})();
