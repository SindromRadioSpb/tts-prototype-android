'use strict';
// Учебная книга XLSX «Мой словарь» (X1–X12): переходы слово ↔ таблица ↔ формы ↔ проверка ↔ «Начать»,
// таблицы Pealim с подсветкой встреченных/освоенных форм, самопроверка формулами с ключами (краткое и полное
// написание), «Повторить сегодня». Пишет образец в .tmp/ (DICT_BOOK_SAMPLE=1) для проверки в Excel.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const IR = require('../public/js/inflection-render.js');
const FD = require('../public/js/form-drill-core.js');
const X = require('../public/js/xlsx-core.js');
const W = require('../public/js/dictionary-workbook.js');

const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz'))).toString('utf8'));
const NOW = Date.parse('2026-10-13T09:00:00Z');
function wordFrom(p, extra) {
  const st = IR.projectStudyForms(p);
  const met = new Set(extra.met || []), done = new Set(extra.done || []);
  const groups = st.groups.map((g) => ({ key: g.key, label: g.label, forms: g.forms.map((f) => ({ slot: f.slot, label: f.label, he: f.he, translit: f.translit, ru: '', met: met.has(f.slot), mastered: done.has(f.slot), seen: done.has(f.slot) ? 2 : 0, right: done.has(f.slot) ? 2 : 0 })) }));
  const total = groups.reduce((a, g) => a + g.forms.length, 0);
  return Object.assign({ key: 'pid:' + p.pealim_id, he: p.lemma_niqqud || p.lemma, translit: '', meaning: p.meaning, posText: p.pos, binyan: p.binyan, root: p.root,
    status: 'l2', statusText: 'узнаю', strength: 64, reps: 3, lapses: 1, occ: 2, added: NOW - 9 * 864e5, lastSeen: NOW - 864e5,
    pealimUrl: p.pealim_url, appUrl: 'https://linguistpro.kolosei.com/dictionary.html?word=pid%3A' + p.pealim_id,
    table: { groups }, formsTotal: total, formsMastered: done.size }, extra);
}
const katav = ds.paradigms.find((p) => p.lemma === 'לכתוב' && p.binyan === 'paal');
const dibber = ds.paradigms.find((p) => p.lemma === 'לדבר' && p.binyan === 'piel');
const words = [
  wordFrom(katav, { met: ['PERF-3fs'], done: ['PERF-1s', 'PERF-2ms'], due: NOW - 2 * 864e5, example: { he: 'הִיא כָּתְבָה מִכְתָּב אָרֹךְ', at: 'הִיא '.length, len: 'כָּתְבָה'.length, ru: 'она написала длинное письмо', title: 'Смоук' } }),
  wordFrom(dibber, { status: 'known', statusText: 'знаю', due: NOW + 20 * 864e5 }),
  { key: 'noun#x', he: 'אַהֲבָה', meaning: 'любовь', posText: 'сущ.', status: 'new', statusText: 'новое' },
];
const data = { now: NOW, dateText: '13.10.2026', filterText: 'глагол', words,
  progress: { statuses: [{ key: 'l2', label: 'узнаю', now: 1, dWeek: 1, dMonth: 1 }, { key: 'known', label: 'знаю', now: 1, dWeek: 0, dMonth: 1 }], maxStatus: 1,
    lines: [['За неделю', 'стало «знаю» +0']], weekly: [{ label: '6–13 окт.', n: 12, fails: 3 }], maxWeek: 12,
    weak: [{ dim: 'биньян', label: 'piel', fails: 5, of: 12, rate: 5 / 12, words: 3, weak: true }] },
  statusLegend: [{ key: 'l2', label: 'узнаю' }] };
const book = W.build(data, null);
const sheet = (name) => book.sheets.find((s) => s.name === name);
const parts = X.buildParts(book);
const xmlOf = (i) => parts['xl/worksheets/sheet' + i + '.xml'];

test('six sheets in study order, «Начать» opens first', () => {
  assert.deepEqual(book.sheets.map((s) => s.name), ['Начать', 'Словарь', 'Таблицы', 'Формы', 'Проверь себя', 'Прогресс']);
  assert.match(parts['xl/workbook.xml'], /activeTab="0"/);
});

test('X1 word → its table block → back to the same word row', () => {
  const tableLink = /<hyperlink ref="Q3" location="'Таблицы'!(A\d+)"/.exec(xmlOf(2));
  assert.ok(tableLink, 'Словарь row of לכתוב links to its table');
  const block = book.meta.tableRow['pid:' + katav.pealim_id];
  assert.equal(tableLink[1], 'A' + block);
  const back = new RegExp('<hyperlink ref="A' + block + '" location="\'Словарь\'!A3"').exec(xmlOf(3));
  assert.ok(back, 'the block header links back to row 3 of «Словарь»');
  assert.ok(!/<hyperlink ref="Q5"/.test(xmlOf(2)), 'a word without a table has no table link');
  // every sheet links back to «Начать»
  [2, 3, 4, 5, 6].forEach((i) => assert.match(xmlOf(i), /location="'Начать'!A1"/, 'sheet ' + i));
  // table of contents
  ['Словарь', 'Таблицы', 'Формы', 'Проверь себя', 'Прогресс'].forEach((n) => assert.match(xmlOf(1), new RegExp("location=\"'" + n + "'!")));
});

test('X4 the table block: Pealim cells, met forms highlighted, mastered marked', () => {
  const rows = sheet('Таблицы').rows;
  const block = book.meta.tableRow['pid:' + katav.pealim_id];
  const past = rows.slice(block).find((r) => r.cells && r.cells[0].v === 'Прошедшее').cells;   // a group row of this block
  assert.equal(past[0].v, 'Прошедшее');
  const c3fs = past.find((c) => c.rich && c.rich[1].t === katav.cells['PERF-3fs'].he);
  assert.equal(c3fs.s, 'cellMet');
  const c1s = past.find((c) => c.rich && c.rich[1].t === katav.cells['PERF-1s'].he);
  assert.equal(c1s.s, 'cellDone');
  assert.match(c1s.rich[0].t, /^✓ /);
});

test('X6 self-test: formulas with hidden keys accept defective and plene spelling', () => {
  const ts = sheet('Проверь себя');
  assert.ok(ts.columns.slice(6).every((c) => c.hidden), 'answer keys are hidden');
  const rows = ts.rows;
  const formRow = rows.find((r) => r.cells[0] === 'форма' && r.cells[6] === dibber.cells['PERF-1s'].he) || rows.find((r) => r.cells[0] === 'форма' && FD.pleneOf(r.cells[6]) !== FD.skeleton(r.cells[6]));
  assert.ok(formRow, 'a form whose plene spelling differs');
  assert.notEqual(formRow.cells[7], formRow.cells[8]);
  assert.equal(formRow.cells[8], FD.skeleton(FD.pleneOf(formRow.cells[6])));
  assert.match(formRow.cells[4].f, /UNICHAR\(1456\)/, 'niqqud stripped from the typed answer');
  assert.match(formRow.cells[4].f, /_xlfn\.UNICHAR\(1501\),_xlfn\.UNICHAR\(1502\)/, 'final mem folded');
  const wordTasks = rows.filter((r) => r.cells[0] === 'слово');
  assert.equal(wordTasks.length, 3, 'meaning → word for every word with a meaning');
  assert.match(xmlOf(1), /COUNTIF\('Проверь себя'!E3:E\d+,&quot;✓\*&quot;\)/);
});

test('X3 «Повторить сегодня» lists due words with a link to their row; dates are real dates', () => {
  const start = sheet('Начать').rows.map((r) => (Array.isArray(r) ? r : r.cells));
  const i = start.findIndex((c) => c[0] && c[0].v === 'Повторить сегодня');
  assert.equal(start[i + 1][0].v, katav.lemma_niqqud || katav.lemma);
  assert.deepEqual(start[i + 1][0].link, { sheet: 'Словарь', ref: 'A3' });
  assert.ok(!start.some((c) => c[0] && c[0].v === (dibber.lemma_niqqud || dibber.lemma)), 'not due yet');
  assert.equal(sheet('Словарь').rows[0].cells[9], X.dateSerial(NOW - 2 * 864e5));
  assert.match(xmlOf(2), /<formula>AND\(J3&lt;&gt;&quot;&quot;,J3&lt;=TODAY\(\)\)<\/formula>/);
});

test('X7 the example sentence has the word in bold', () => {
  const ex = sheet('Словарь').rows[0].cells[13];
  assert.deepEqual(ex.rich.map((r) => r.t), ['הִיא ', 'כָּתְבָה', ' מִכְתָּב אָרֹךְ']);
  assert.equal(ex.rich[1].b, true);
});

test('sample workbook for Excel', async () => {
  if (!process.env.DICT_BOOK_SAMPLE) return;
  const JSZip = require('../public/db/jszip.min.js');
  const zip = new JSZip();
  Object.entries(parts).forEach(([k, v]) => zip.file(k, v));
  fs.mkdirSync(path.join(__dirname, '..', '.tmp'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', '.tmp', 'dictionary-book-sample.xlsx'), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
});

test('X10 print: «Словарь» prints its main columns with the header repeated', () => {
  assert.match(parts['xl/workbook.xml'], /<definedName name="_xlnm.Print_Area" localSheetId="1">'Словарь'!\$A\$1:\$P\$5<\/definedName>/);
  assert.match(parts['xl/workbook.xml'], /<definedName name="_xlnm.Print_Titles" localSheetId="1">'Словарь'!\$1:\$2<\/definedName>/);
});
