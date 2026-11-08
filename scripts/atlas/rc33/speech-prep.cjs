#!/usr/bin/env node
// Speaker text for atlas 97001 RC3.3: what the voice says where the study line is not speakable as is.
// Writes atlas/a97001rc32/speech-overrides.json and a gate report. No network, no recordings.
//   node scripts/atlas/rc33/speech-prep.cjs [--data .tmp/rc33/candidate] [--audit <findings.json>] [--report <file>]
// The study fields (he_niqqud, translit) are never changed here: they show the book, the voice reads this layer.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const T = require('../atlas-tts.cjs');
const Speech = require('../../../public/js/atlas-speech.js');
const E = require('../../../public/js/atlas-edition.js');

const ROOT = path.resolve(__dirname, '../../..');
const BOOK = path.join(ROOT, 'atlas', 'a97001rc32');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DATA = path.resolve(args.data || path.join(ROOT, '.tmp', 'rc33', 'candidate'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const short = (id) => id.replace(/^a97001rc32:/, '');

// Abbreviations in the book → how they are said. Prefixed forms are listed explicitly (no guessing).
const ABBR = [
  ['לְפלב"מ', 'לִפְלָדָה בִּלְתִּי מַחְלִידָה'], ['בְּפלב"מ', 'בִּפְלָדָה בִּלְתִּי מַחְלִידָה'], ['פלב"מ', 'פְּלָדָה בִּלְתִּי מַחְלִידָה'],
  ['מ״מ', 'מִילִימֶטֶר'], ['מ"מ', 'מִילִימֶטֶר'], ['סה"כ', 'סַךְ הַכֹּל'], ['ע"י', 'עַל יְדֵי'], ["וְכו'", 'וְכוּלֵּי'],
  ['תִּיבָּ״ם', 'תִּכְנוּן וְיִיצּוּר בְּעֶזְרַת מַחְשֵׁב'], ['לת.ז.', 'לִתְעוּדַת זֶהוּת'], ["לטמפ'", 'לְטֶמְפֶּרָטוּרָה'], ["טֶמְפ'", 'טֶמְפֶּרָטוּרָה'],
];
// Rows whose line is not speakable as printed: exact replacements on a copy of the pointed line.
const LINE = {
  // slash abbreviations of the source (audit A001-050-F002…F006): full alternatives
  'p28:b004': [['כּוֹחַ/וֹת נָטוּי/יִם', 'כּוֹחַ נָטוּי אוֹ כּוֹחוֹת נְטוּיִים,'], ['זָווִית/יוֹת הַכּוֹחַ/וֹת', 'זָוִית אוֹ זָוִיּוֹת הַכּוֹחַ אוֹ הַכּוֹחוֹת']],
  'p29:b006': [['כּוֹחַ/וֹת נָטוּי/יִם', 'כּוֹחַ נָטוּי אוֹ כּוֹחוֹת נְטוּיִים,'], ['זָווִית/יוֹת הַכּוֹחַ/וֹת', 'זָוִית אוֹ זָוִיּוֹת הַכּוֹחַ אוֹ הַכּוֹחוֹת']],
  'p31:b006': [['כּוֹחַ/וֹת נָטוּי/יִם', 'כּוֹחַ נָטוּי אוֹ כּוֹחוֹת נְטוּיִים,'], ['זָווִית/יוֹת הַכּוֹחַ/וֹת', 'זָוִית אוֹ זָוִיּוֹת הַכּוֹחַ אוֹ הַכּוֹחוֹת']],
  'p28:b008:s01': [['כּוֹחַ/וֹת נָטוּי/יִם', 'כּוֹחַ נָטוּי אוֹ כּוֹחוֹת נְטוּיִים']],
  'p32:b002': [['כּוֹחַ/וֹת נָטוּי/יִם', 'כּוֹחַ נָטוּי אוֹ כּוֹחוֹת נְטוּיִים']],
  'p115:b003:s02': [['וְ/אוֹ', 'אוֹ']],
  'p165:b001': [[' (פלב"מ)', '']],   // the abbreviation right after its own expansion is not read twice
  'p82:b002': [['‘', ''], ['’', '']],
  'p126:b005': [['σᵤₜₛ', 'σ_uts']],
  'p130:b006': [['(10″)', "(10 אִינְץ')"]],
  'p167:b003': [['B.C.C', 'בִּי-סִי-סִי']],
  'p172:b001:s03': [['F.C.C', 'אֶף-סִי-סִי']],
  'p1:b005': null,   // set below as plain text
};
const TEXT = {
  // p171 reversible transformations, said «equilibrium between … and …» (owner accepted the recommendation, 2026-11-08)
  'p171:f01': 'שִׁוּוּי מִשְׁקָל בֵּין גַּמָּה, 0.83 אָחוּז פַּחְמָן, לְבֵין אַלְפָא, 0.020 אָחוּז פַּחְמָן, וְעוֹד צֶמֶנְטִיט, אֶף אִי 3 סִי, 6.7 אָחוּז פַּחְמָן',
  'p171:f03': 'שִׁוּוּי מִשְׁקָל בֵּין נְתֹכֶת, אֶל, לְבֵין גַּמָּה וְעוֹד צֶמֶנְטִיט, אֶף אִי 3 סִי',
  'p1:b005': 'תַּשְׁפַּד – 2024',   // the Hebrew year תשפ"ד, said as one word
};
// English-only rows: the Hebrew voice does not read English (the Hebrew of the row is read where present).
const ENGLISH_ONLY = ['p196:img01:label-system', 'p197:img02:heading'];

function audit() {
  if (!args.audit) return { unresolved: new Set() };
  const f = JSON.parse(fs.readFileSync(args.audit, 'utf8'));
  const unresolved = new Set(f.filter((x) => x.category === 'unresolved_candidate').flatMap((x) => x.targets).map((t) => t.replace(/^a97001:/, '')));
  return { unresolved };
}

function main() {
  T.selectAtlas('a97001rc32');
  const lex = JSON.parse(fs.readFileSync(path.join(BOOK, 'speech-lexicon.json'), 'utf8'));
  const { unresolved } = audit();
  const items = {};
  const rules = {};
  const add = (id, entry) => { items[id] = entry; rules[entry.rule] = (rules[entry.rule] || 0) + 1; };
  const wholeWordSlash = /([א-ת][֑-ׇ]*[א-ת][֑-ׇא-ת]*)\/([א-ת][֑-ׇ]*[א-ת][֑-ׇא-ת]{2,})/g;

  for (const file of fs.readdirSync(path.join(DATA, 'sections')).filter((f) => f.endsWith('.json')).sort()) {
    const sid = file.slice(0, -5);
    const plan = T.sectionPlan(DATA, sid, lex, { items: {} });
    const raw = E.projectCorpus(JSON.parse(fs.readFileSync(path.join(DATA, 'sections', file))), '');
    const byId = new Map();
    for (const p of raw.pages) for (const it of p.items || []) byId.set(it.id, it);
    for (const it of plan.items) {
      if (it.skip) continue;
      const item = byId.get(it.id), id = short(it.id);
      const hn = String(item.he_niqqud || ''), tr = String(item.translit || '');
      // 1. never voice an unresolved reading, an editor's addition or an audit-unresolved row
      if (/⟦|\[unresolved|\[unreadable|\[…\]|\[не|неразреш/.test(hn + ' ' + tr)) { add(it.id, { exclude: true, reason: 'UNRESOLVED_READING', rule: 'unresolved' }); continue; }
      if (item.editorial_addition) { add(it.id, { exclude: true, reason: 'EDITORIAL_ADDITION', rule: 'editorial' }); continue; }
      if (unresolved.has(id)) { add(it.id, { exclude: true, reason: 'AUDIT_UNRESOLVED', rule: 'audit-unresolved' }); continue; }
      if (ENGLISH_ONLY.includes(id)) { add(it.id, { exclude: true, reason: 'ENGLISH_ONLY', rule: 'english' }); continue; }
      if (TEXT[id]) { add(it.id, { text: TEXT[id], rule: 'manual-text' }); continue; }
      // 2. formulas: the book's crossed-out root is announced as rejected (A51-100-005/006)
      if (item.type === 'formula') {
        let said = it.ok ? it.text : null, rule = null;
        if (!said) {   // no LaTeX: the plain notation is read line by line («= 0» and «N − W» on the next line are not «0 N»)
          const src = String(item.he || item.source_text || '');
          // «γ ↔ α + Fe₃C»: a reversible transformation, said «equilibrium between … and …» (owner accepted, 2026-11-08)
          if (/↔/.test(src)) { add(it.id, { exclude: true, reason: 'REVERSIBLE_ARROW_UNMAPPED', rule: 'formula-gap' }); continue; }
          if (/^\s*\d+\s*$/.test(src)) { add(it.id, { exclude: true, reason: 'NUMBER_ONLY', rule: 'number-only' }); continue; }
          try {
            said = src.split(/\n+/).map((l) => l.trim()).filter(Boolean)
              .map((l) => Speech.proseSpeech(l.replace(/_\(([^()]*)\)/g, '_$1'), lex)).join('. ');
            rule = 'plain-formula';
          } catch (e) { add(it.id, { exclude: true, reason: 'FORMULA_NOT_SPEAKABLE:' + e.message, rule: 'formula-gap' }); continue; }
        }
        const crossed = (item.source_annotations || []).filter((a) => a && a.type === 'crossed_out')
          .concat((item.source_marks || []).filter((m) => m && /^crossed_out/.test(String(m.mark || ''))));
        if (crossed.length) { said = said.replace(/[.\s]+$/, '') + ' – נִפְסָל'; rule = 'crossed-out-root'; }
        if (rule) add(it.id, { text: said, rule });
        continue;
      }
      // 3. blocks: line fixes, abbreviations, whole-word alternatives with «/»
      let line = hn, rule = null;
      for (const [a, b] of LINE[id] || []) { if (!line.includes(a.normalize('NFC')) && !line.includes(a)) throw Error('LINE_FIX_MISSING ' + id + ' ' + a); line = line.normalize('NFC').split(a.normalize('NFC')).join(b.normalize('NFC')); rule = 'line-fix'; }
      // «0.2%C» is percent carbon, not «percent times C»
      if (/%\s*C(?![A-Za-z])/.test(line)) { line = line.replace(/%\s*C(?![A-Za-z])/g, '% פַּחְמָן'); rule = rule || 'percent-carbon'; }
      for (const [a, b] of ABBR) { const na = a.normalize('NFC'); if (line.normalize('NFC').includes(na)) { line = line.normalize('NFC').split(na).join(b.normalize('NFC')); rule = rule || 'abbreviation'; } }
      if (wholeWordSlash.test(line.normalize('NFC'))) { line = line.normalize('NFC').replace(wholeWordSlash, '$1 אוֹ $2'); rule = rule || 'slash-alternative'; }
      wholeWordSlash.lastIndex = 0;
      if (/^AA \d{4}$/.test(String(item.he || '')) && !hn) { add(it.id, { text: 'אֵיי אֵיי ' + item.he.slice(3), rule: 'alloy-code' }); continue; }
      if (!hn.trim()) { add(it.id, { exclude: true, reason: 'NO_NIQQUD_IN_EDITION', rule: 'no-niqqud' }); continue; }
      if (rule) {
        try { add(it.id, { text: Speech.blockSpeech({ ...item, he_niqqud: line }, lex), rule }); }
        catch (e) { add(it.id, { exclude: true, reason: 'NOT_SPEAKABLE:' + e.message, rule: 'gap' }); }
        continue;
      }
      // product key rows on p197: «S = Sheet = פַּח» → the code letters and the Hebrew
      const key = /^([A-Z]{1,2})\s*=\s*[^=]+=\s*(.+)$/.exec(hn);
      if (!it.ok && key) { add(it.id, { text: Speech.blockSpeech({ ...item, he_niqqud: key[1] + ' – ' + key[2] }, lex), rule: 'product-key' }); continue; }
      if (!it.ok && /^NOTHING|NO_HEBREW_OUTPUT/.test(it.reason)) { add(it.id, { exclude: true, reason: 'NUMBER_ONLY', rule: 'number-only' }); continue; }
      if (!it.ok) add(it.id, { exclude: true, reason: 'NOT_SPEAKABLE:' + it.reason, rule: 'gap' });
    }
  }
  const doc = { schema: 'linguistpro.atlas-speech-overrides.1', atlas_id: 'a97001rc32',
    basis: 'RC3.3 speaker text: abbreviations, slash alternatives, plain formulas and rejected roots; unresolved readings are not voiced.',
    edition_revision: JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8')).structure_revision,
    review: { status: 'owner_accepted_recommendations', reviewed_by: 'owner', reviewed_at: '2026-11-08' }, rules, items };
  const bytes = Buffer.from(JSON.stringify(doc, null, 1) + '\n');
  fs.writeFileSync(path.join(BOOK, 'speech-overrides.json'), bytes);

  // Gate: what the voice will actually say.
  const overrides = doc, problems = [], reasons = {};
  let voiced = 0, total = 0;
  for (const file of fs.readdirSync(path.join(DATA, 'sections')).filter((f) => f.endsWith('.json')).sort()) {
    const plan = T.sectionPlan(DATA, file.slice(0, -5), lex, overrides);
    for (const it of plan.items) {
      if (it.skip) continue;
      total++;
      if (!it.ok) { const r = it.reason.split(':').slice(0, 2).join(':'); reasons[r] = (reasons[r] || 0) + 1; continue; }
      voiced++;
      const t = it.text.replace(/הַ״/g, 'הַ ');   // «שֶׁהַ״נֶקַע״»: the article before a quoted word is not an acronym
      const bad = [[/[א-ת][֑-ׇ]*\/[א-ת]/, 'slash'], [/[[\]⟦⟧]/, 'bracket-placeholder'], [/[А-Яа-яЁё]/, 'cyrillic'], [/[A-Za-z]/, 'latin'],
        [/במקור|בְּמָקוֹר|תיקון|תִּקּוּן/, 'editorial-insert'], [/[א-ת][֑-ׇ]*["״][א-ת]/, 'unexpanded-acronym']].filter(([re]) => re.test(t));
      if (bad.length) problems.push({ id: short(it.id), problems: bad.map((b) => b[1]), text: t.slice(0, 160) });
    }
  }
  const report = { schema: 'atlas97001.rc33-speech-prep.1', overrides_sha256: sha(bytes), overrides: Object.keys(items).length, rules,
    voiced, total, not_voiced: reasons, gate_problems: problems.length, problems };
  if (args.report) fs.writeFileSync(path.resolve(args.report), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, problems: problems.slice(0, 25) }, null, 1));
}
main();
