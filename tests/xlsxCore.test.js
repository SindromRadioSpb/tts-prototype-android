'use strict';
// XLSX-писатель выгрузки словаря: валидная книга (части, связи, типы), иврит справа-налево, экранирование,
// числа как числа, автофильтр и закреплённая шапка; упаковка JSZip читается обратно.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../public/js/xlsx-core.js');
const JSZip = require('../public/db/jszip.min.js');

const sheets = [
  { name: 'Словарь', columns: [{ header: 'Слово', rtl: true, width: 18 }, { header: 'Значение', width: 30 }, { header: 'Встреч', num: true }],
    rows: [['כָּתַב', 'писать <&> "x"', 3], ['שָׁמַע', '', 0], ['בַּיִת', 'дом\u0007', null]] },
  { name: 'A/B:C[too long name that goes past thirty-one]', columns: [{ header: 'x' }], rows: [] },
];

test('column names', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(X.colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

test('parts: every relationship target exists and every part is typed', () => {
  const p = X.buildParts(sheets);
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']
    .forEach((k) => assert.ok(p[k], k));
  const targets = [...p['xl/_rels/workbook.xml.rels'].matchAll(/Target="([^"]+)"/g)].map((m) => 'xl/' + m[1]);
  targets.forEach((t) => assert.ok(p[t], 'target ' + t));
  assert.match(p['[Content_Types].xml'], /\/xl\/worksheets\/sheet2\.xml/);
  assert.match(p['xl/workbook.xml'], /<sheet name="Словарь" sheetId="1" r:id="rId1"\/>/);
  const n2 = /<sheet name="([^"]+)" sheetId="2"/.exec(p['xl/workbook.xml'])[1];
  assert.ok(n2.length <= 31 && !/[\/:\[\]]/.test(n2), n2);
});

test('cells: Hebrew right-to-left, text escaped, control chars dropped, numbers stay numbers, empties skipped', () => {
  const s = X.buildParts(sheets)['xl/worksheets/sheet1.xml'];
  assert.match(s, /<c r="A2" t="inlineStr" s="2"><is><t xml:space="preserve">כָּתַב<\/t><\/is><\/c>/);
  assert.match(s, /писать &lt;&amp;&gt; &quot;x&quot;/);
  assert.match(s, /<c r="C2"><v>3<\/v><\/c>/);
  assert.match(s, /<c r="C3"><v>0<\/v><\/c>/);
  assert.ok(!/B3/.test(s), 'an empty cell is not written');
  assert.ok(!/\u0007/.test(s));
  assert.match(s, /<pane ySplit="1"[^>]*state="frozen"\/>/);
  assert.match(s, /<autoFilter ref="A1:C4"\/>/);
  assert.match(s, /<c s="1" r="A1" t="inlineStr">/);
});

test('zipped with JSZip, the workbook reads back', async () => {
  const zip = new JSZip();
  Object.entries(X.buildParts(sheets)).forEach(([k, v]) => zip.file(k, v));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  const back = await JSZip.loadAsync(buf);
  assert.match(await back.file('xl/worksheets/sheet1.xml').async('string'), /שָׁמַע/);
});
