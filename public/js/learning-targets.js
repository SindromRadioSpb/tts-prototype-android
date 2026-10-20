// Selected grammatical readings. Additive to lemma-canon: existing word keys never change.
// Identifiers contain only a shipped Pealim id, a cell id and closed clitic codes.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LearningTargets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PREFIX = 'ft1:';
  var CODES = { v: 'ו', sh: 'ש', ksh: 'כש', msh: 'מש', b: 'ב', l: 'ל', k: 'כ', m: 'מ', h: 'ה' };
  var LETTERS = { 'ו': 'v', 'ש': 'sh', 'כש': 'ksh', 'מש': 'msh', 'ב': 'b', 'ל': 'l', 'כ': 'k', 'מ': 'm', 'ה': 'h' };
  var SEQ = /^ו?(?:כש|מש|ש)?[בלכמ]?ה?$/;
  function strip(s) { return String(s || '').replace(/[֑-ׇ]/g, ''); }
  function isFormKey(key) { return String(key || '').indexOf(PREFIX) === 0; }
  function decodePrefix(code) {
    if (code === '_') return '';
    var parts = String(code || '').split('.'), out = '';
    if (!parts.length || parts.length > 4) return null;
    for (var i = 0; i < parts.length; i++) { if (!CODES[parts[i]]) return null; out += CODES[parts[i]]; }
    return out && SEQ.test(out) ? out : null;
  }
  function encodePrefix(prefix) {
    var s = String(prefix || '');
    if (!s) return '_';
    if (!SEQ.test(s)) return null;
    var out = [];
    while (s) {
      var unit = /^(כש|מש)/.test(s) ? s.slice(0, 2) : s[0];
      if (!LETTERS[unit]) return null;
      out.push(LETTERS[unit]); s = s.slice(unit.length);
    }
    return out.join('.');
  }
  function parse(key) {
    var m = /^ft1:([1-9][0-9]{0,8}):([A-Za-z0-9-]{1,32}):([a-z._]{1,24})$/.exec(String(key || ''));
    if (!m) return null;
    var prefix = decodePrefix(m[3]);
    if (prefix == null || encodePrefix(prefix) !== m[3]) return null;
    return { version: 1, key: m[0], parentKey: 'pid:' + m[1], pid: m[1], slot: m[2], prefix: prefix,
      prefixCode: m[3], kind: prefix ? 'composed_form' : 'form' };
  }
  function keyFor(pid, slot, prefix) {
    var code = encodePrefix(prefix);
    var key = PREFIX + String(pid || '') + ':' + String(slot || '') + ':' + code;
    return code != null && parse(key) ? key : '';
  }
  function deps(options) {
    var wg = options && options.wordGloss;
    if (!wg && typeof globalThis !== 'undefined') wg = globalThis.WordGloss;
    if (!wg && typeof require === 'function') { try { wg = require('./word-gloss.js'); } catch (_) {} }
    return wg;
  }
  function cliticChain(match, niqqud) {
    var prefix = match.prefix || '';
    var clusters = String(niqqud || '').normalize('NFC').match(/[א-ת][֑-ׇ]*/g) || [];
    var last = clusters[prefix.length - 1] || '';
    // Same fused-article rule as WordGloss.matchCell. Keep the grammatical article in identity.
    if (/[בלכ]$/.test(prefix) && /[ַָ]/.test(last)) prefix += 'ה';
    return prefix;
  }
  function candidates(card, niqqud, options) {
    var wg = deps(options), par = card && card.paradigm;
    if (!wg || !par || !par.cells || !card || card.selectionRequired || card.ambiguous ||
        ['exact', 'owner', 'teacher'].indexOf(card.label) < 0 || !card.pealim_id ||
        String(card.pealim_id) !== String(par.pealim_id) || card.pos !== par.pos) return [];
    var actual = String(niqqud || card.niqqud || '');
    var match; try { match = wg.matchCell(par, actual); } catch (_) { return []; }
    if (!match || match.impossible || !match.slots || !match.slots.length) return [];
    var prefix = cliticChain(match, actual), out = [];
    for (var i = 0; i < match.slots.length; i++) {
      var slot = match.slots[i], key = keyFor(card.pealim_id, slot, prefix);
      if (!key || !par.cells[slot] || !par.cells[slot].he) continue;
      // Select a grammatical reading before composing its gloss; homographic cells stay separate.
      var cells = {}; cells[slot] = par.cells[slot];
      var one = Object.assign({}, par, { cells: cells });
      var form;
      try { form = wg.composeGloss({ label: 'exact', meaning: par.meaning || card.meaning, pos: par.pos, paradigm: one }, actual); } catch (_) { continue; }
      if (!form || !form.form || !form.text) continue;
      out.push(Object.assign(parse(key), { niqqud: actual, word: strip(actual), meaning: form.text,
        grammar: wg.slotHint ? wg.slotHint(slot) : slot, lemma: par.lemma || card.lemma || '', available: true }));
    }
    return out;
  }
  function matches(key, card, niqqud, options) {
    return candidates(card, niqqud, options).some(function (c) { return c.key === key; });
  }
  function describe(key, paradigm, niqqud, options) {
    var target = parse(key), wg = deps(options);
    if (!target || !paradigm || String(paradigm.pealim_id) !== target.pid || !paradigm.cells || !paradigm.cells[target.slot] || !wg) return null;
    var card = { label: 'exact', pealim_id: target.pid, pos: paradigm.pos, paradigm: paradigm, meaning: paradigm.meaning };
    var actual = niqqud || (!target.prefix ? paradigm.cells[target.slot].he : '');
    var found = actual && candidates(card, actual, options).find(function (c) { return c.key === key; });
    if (found) return found;
    if (niqqud) return null; // A mismatched example is never silently replaced by a different reading.
    return Object.assign(target, { lemma: paradigm.lemma || '', grammar: wg.slotHint ? wg.slotHint(target.slot) : target.slot,
      niqqud: '', word: '', meaning: '', available: false, reason: 'source_required' });
  }
  function acceptAnswer(key, paradigm, expected, answer, options) {
    var target = parse(key), wg = deps(options);
    if (!target || !wg || !paradigm || String(paradigm.pealim_id) !== target.pid || !paradigm.cells[target.slot]) return false;
    var card = {label:'exact',pealim_id:target.pid,pos:paradigm.pos,paradigm:paradigm,meaning:paradigm.meaning};
    if (!matches(key,card,expected,options)) return false;
    var FD = options && options.formDrill;
    if (!FD && typeof globalThis !== 'undefined') FD = globalThis.FormDrillCore;
    if (!FD && typeof require === 'function') { try { FD = require('./form-drill-core.js'); } catch (_) {} }
    if (!FD) return strip(expected) === strip(answer);
    var match = wg.matchCell(paradigm,expected), prefix = match && match.prefix || '';
    var actual = FD.skeleton(answer), pre = FD.skeleton(prefix);
    if (actual.slice(0,pre.length) !== pre) return false;
    var cell = {slot:target.slot,he:paradigm.cells[target.slot].he};
    return !!FD.checkTyped(cell,{groups:[{forms:[cell]}]},actual.slice(pre.length)).ok;
  }
  return { PREFIX: PREFIX, isFormKey: isFormKey, parse: parse, keyFor: keyFor, encodePrefix: encodePrefix,
    candidates: candidates, matches: matches, describe: describe, acceptAnswer: acceptAnswer };
});
