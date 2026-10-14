// public/js/text-key-scan.js — O-083: ONE scan of a text (or a set of texts) on the keys of the dictionary's list, for
// every surface that says «знакомо X%» about it: «Мой словарь» (a lens) and the cards of the learner's own texts in the
// Room and the Studio. Same names input, same scan, same ingredients — the numbers agree by construction.
// Spec: docs/planning/word-layer/F4_O083_CARD_FAMILIARITY_ON_LIST_KEYS_2026_10_15.md.
//
// A lens T = { texts: [{ id, key, from, n }], rows: [sentence], rowText: [text index per row] }. Browser parts use
// window.ReaderMorph / WordGlossAI / LexicalResolutionCore+Service / MorphHost; listIngredients is pure (node tests).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TextKeyScan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCAN_VERSION = "list-keys-scan-v1";
  // every Hebrew word of a row, as the B7 worker counts them — the reading-time measure (not the familiarity one)
  var HEBREW_TOKEN = /[א-ת][א-ת֑-ׇ׳״'’-]*/gu;
  function G() { return typeof globalThis !== "undefined" ? globalThis : {}; }
  function RM() { return G().ReaderMorph; }
  function yieldNow() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

  // the text (of the lens) a row belongs to, and the row's own order index in it
  function rowPlace(T, rowIdx) {
    var ti = T.rowText[rowIdx], t = T.texts[ti], row = T.rows[rowIdx];
    if (!t || !row) return null;
    return { t: t, row: row, orderIndex: row.order_index != null ? Number(row.order_index) : rowIdx - (t.from || 0) };
  }
  // a row's word unit at a tokenizer offset — the same tokens, alignment and joins as ReaderMorph.scanRows
  function unitAt(row, off) {
    var R = RM(), plain = String(row.he_plain != null ? row.he_plain : row.he || ""), vocal = String(row.he_niqqud || "");
    var toks, pairs;
    if (plain) {
      var al = R.alignSurfaceNiqqud(plain, vocal), w = 0; toks = R.tokenize(plain);
      pairs = toks.filter(function (t) { return t.isWord; }).map(function (t) { var a = al[w++] || {}; return [a.surface || t.text, a.niqqud || ""]; });
    } else {
      toks = R.tokenize(vocal);
      pairs = toks.filter(function (t) { return t.isWord; }).map(function (t) { return [R.stripNiqqud(t.text), t.text]; });
    }
    return (R.joinSplitWords(toks, pairs) || []).find(function (u) { return u.off === off; }) || null;
  }
  function occurrenceOf(T, ri, off) {
    var pl = rowPlace(T, ri), u = pl && unitAt(pl.row, Number(off));
    if (!pl || !u) return null;
    return { text_id: String(pl.t.id), sentence_id: String(pl.row.id), word_offset: Number(off), text_key: pl.t.key || String(pl.t.id), order_index: pl.orderIndex,
      surface: u.surface, niqqud: u.niqqud, sentence_he_niqqud: pl.row.he_niqqud || "", sentence_he: pl.row.he_plain || "" };
  }
  // the word layer (Ф3, paid at build): the translation of each place, read only where the layer's word count is the
  // scan's (a row whose pointing splits words differently is skipped, never misaligned) → { gloss, nameAt, at(ri, off) }
  async function wordLayer(T) {
    var W = G().WordGlossAI, R = RM(), out = { gloss: new Map(), nameAt: new Set(), at: function (ri, off) { return this.gloss.get(ri + ":" + off) || ""; } };
    if (!W || typeof W.wordAtData !== "function" || !R) return out;
    var t0 = now();
    for (var ri = 0; ri < T.rows.length; ri++) {
      var row = T.rows[ri], plain = String(row.he_plain || ""), voc = String(row.he_niqqud || "");
      var n = R.tokenize(plain || voc).filter(function (t) { return t.isWord; }).length;
      if (voc && plain && R.words(voc).length !== n) continue;
      for (var k = 0; k < n; k++) {
        var g = null; try { g = await W.wordAtData(row, k); } catch (_) { g = null; }
        if (!g || !g.gloss) continue;
        out.gloss.set(ri + ":" + k, g.gloss);
        if (/^\s*имя\s*:/i.test(g.gloss)) out.nameAt.add(ri + ":" + k);
      }
      if (now() - t0 > 24) { await yieldNow(); t0 = now(); }
    }
    return out;
  }
  // the learner's «это имя (здесь)» decisions (lexical_resolution_events, manual_correction → propernoun), each re-proved
  // against its exact place (source anchor) → Set('rowIdx:offset')
  async function nameDecisions(ldb, T) {
    var out = new Set(), Core = G().LexicalResolutionCore, Svc = G().LexicalResolutionService;
    if (!Core || !Svc || !ldb || typeof ldb.listLexicalResolutionEventsForTexts !== "function") return out;
    var events = [];
    try { events = (await ldb.listLexicalResolutionEventsForTexts(T.texts.map(function (t) { return t.id; }))) || []; } catch (_) { events = []; }
    if (!events.length) return out;
    var rowOf = new Map(); T.rows.forEach(function (r, ri) { rowOf.set(String(r.id), ri); });
    var ids = new Set(events.map(function (e) { return e.occurrence_id; }));
    for (var id of ids) {
      var latest = Core.latest(events, id);
      if (!latest || latest.action !== "manual_correction" || (latest.chosen_analysis || {}).lp_pos !== "propernoun") continue;
      var ri = rowOf.get(String(latest.sentence_id)); if (ri == null) continue;
      var occ = occurrenceOf(T, ri, latest.word_offset); if (!occ) continue;
      var proj = null; try { proj = await Svc.projectExactOccurrence(occ, events, Core); } catch (_) { proj = null; }
      if (proj && proj.state === "resolved") out.add(ri + ":" + latest.word_offset);
    }
    return out;
  }
  // the device's Dicta lexicon must be in ReaderMorph BEFORE a scan: a word Pealim does not read is keyed through it
  async function ensureLexicon(ldb) {
    var MH = G().MorphHost;
    if (MH && typeof MH.loadDictaLexicon === "function") { try { await MH.loadDictaLexicon(function () { return Promise.resolve(ldb); }); } catch (_) {} }
  }
  // the lens → { scan, layer, nameAt }: lexicon first, the learner's name decisions, the layer's «имя:» readings, the scan
  async function scanLens(ldb, T, opts) {
    opts = opts || {};
    await ensureLexicon(ldb);
    var nameAt = await nameDecisions(ldb, T);
    var layer = await wordLayer(T);
    var scan = await RM().scanRows(T.rows, { nameAt: nameAt, nameHintAt: layer.nameAt, onProgress: opts.onProgress });
    return { scan: scan, layer: layer, nameAt: nameAt };
  }
  // Д7.4: rows [from, to) of a scan → ingredients for evaluateRecordedFamiliarityV2. Keyed tokens count by their list
  // key; unsure tokens are «unknown»; name-like unsure tokens leave the denominator; closed-class words are not in the
  // list and not here either. Pure.
  function listIngredients(input) {
    input = input || {};
    var keys = input.rowKeys || [], stats = input.rowStats || [], from = input.from || 0, to = input.to == null ? keys.length : input.to;
    var freq = Object.create(null), unresolved = 0, names = 0, keyed = 0;
    for (var ri = from; ri < to; ri++) {
      (keys[ri] || []).forEach(function (k) { if (k) { freq[k] = (freq[k] || 0) + 1; keyed++; } });
      var st = stats[ri] || {};
      names += Number(st.n) || 0;
      unresolved += Math.max(0, (Number(st.u) || 0) - (Number(st.n) || 0));
    }
    return { resolver_version: input.resolverVersion, key_frequencies: Object.keys(freq).sort().map(function (k) { return [k, freq[k]]; }),
      unresolved_token_count: unresolved, proper_name_token_count: names, total_token_count: keyed + unresolved + names };
  }
  function textTokenCount(rows, from, to) {
    var n = 0;
    for (var i = from; i < to; i++) {
      var r = rows[i], s = String(r && (r.he_niqqud || r.hebrew_niqqud || r.he_plain || r.hebrew_plain) || "").normalize("NFC");
      var m = s.match(HEBREW_TOKEN); n += m ? m.length : 0;
    }
    return n;
  }
  // one own text → a cacheable ingredients packet (the B7 cache contract) on the list's keys; text_token_count = every
  // word of the text, for the reading-time estimate
  async function textIngredients(ldb, text, rows, meta) {
    meta = meta || {};
    var C = G().LearningCompassCore;
    // no Pealim engine = every word «unknown» — an honest failure (never cached), not a fabricated 0% (the worker's rule)
    try { await RM().ensureEngine(); } catch (_) { throw new Error("LEXICAL_RESOLVER_UNAVAILABLE"); }
    var T = { texts: [{ id: String(text.id), key: text.text_key || String(text.id), from: 0, n: rows.length }], rows: rows || [], rowText: (rows || []).map(function () { return 0; }) };
    var res = await scanLens(ldb, T);
    var ing = listIngredients({ rowKeys: res.scan.rowKeys, rowStats: res.scan.rowStats, from: 0, to: T.rows.length, resolverVersion: C && C.RESOLVER_VERSION });
    var textTokens = textTokenCount(T.rows, 0, T.rows.length);
    if (!textTokens) throw new Error("NO_HEBREW_TOKENS");
    return Object.assign({
      schema_version: C && C.INGREDIENTS_SCHEMA, source_class: String(meta.source_class || "mytext"), source_key: String(meta.source_key || T.texts[0].key),
      content_revision: String(meta.content_revision || ""), content_sha256: "", entitlement_revision: null,
      lexical_resolver_version: SCAN_VERSION, built_at: new Date().toISOString(), text_token_count: textTokens,
    }, ing);
  }
  // what the keys of a scan depend on besides the text itself: the scan's version, the device's Dicta lexicon, the
  // learner's alias decisions and name decisions. A change re-keys the cards (their cache is disposable).
  async function generation(ldb) {
    var count = async function (sql) { try { var r = await ldb.dbQuery(sql, []); return Number(r && r[0] && r[0].n) || 0; } catch (_) { return 0; } };
    var lex = await count("SELECT COUNT(*) n FROM dicta_lexicon");
    var alias = await count("SELECT COUNT(*) n FROM review_log WHERE kind = 'alias'");
    var names = await count("SELECT COUNT(*) n FROM lexical_resolution_events");
    return [SCAN_VERSION, lex, alias, names].join(":");
  }

  return { SCAN_VERSION: SCAN_VERSION, rowPlace: rowPlace, unitAt: unitAt, occurrenceOf: occurrenceOf, wordLayer: wordLayer,
    nameDecisions: nameDecisions, ensureLexicon: ensureLexicon, scanLens: scanLens, listIngredients: listIngredients,
    textTokenCount: textTokenCount, textIngredients: textIngredients, generation: generation };
});
