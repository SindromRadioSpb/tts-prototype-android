'use strict';
// XLSX-писатель учебной книги: валидная книга (части, связи, типы), стили без дублей, иврит справа-налево,
// экранирование, числа/даты, внутренние и внешние ссылки, rich text, формулы с пересчётом при открытии,
// условное форматирование, печать; упаковка JSZip читается обратно.
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../public/js/xlsx-core.js');
const JSZip = require('../public/db/jszip.min.js');

const simple = [
  { name: 'Словарь', columns: [{ header: 'Слово', rtl: true, width: 18 }, { header: 'Значение', width: 30 }, { header: 'Встреч' }],
    rows: [['כָּתַב', 'писать <&> "x"', 3], ['שָׁמַע', '', 0], ['בַּיִת', 'дом\u0007', null]] },
  { name: 'A/B:C[too long name that goes past thirty-one]', columns: [{ header: 'x' }], rows: [] },
];

test('column names and dates', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(X.colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.equal(X.dateSerial(new Date(2026, 9, 13, 23, 0).getTime()), 46308, '2026-10-13 is serial 46308');
});

test('parts: every relationship target exists and every part is typed', () => {
  const p = X.buildParts(simple);
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']
    .forEach((k) => assert.ok(p[k], k));
  [...p['xl/_rels/workbook.xml.rels'].matchAll(/Target="([^"]+)"/g)].forEach((m) => assert.ok(p['xl/' + m[1]], 'target ' + m[1]));
  assert.match(p['xl/workbook.xml'], /<sheet name="Словарь" sheetId="1" r:id="rId1"\/>/);
  assert.match(p['xl/workbook.xml'], /fullCalcOnLoad="1"/);
  const n2 = /<sheet name="([^"]+)" sheetId="2"/.exec(p['xl/workbook.xml'])[1];
  assert.ok(n2.length <= 31 && !/[\/:\[\]]/.test(n2), n2);
});

test('cells: header style, Hebrew RTL, escaping, control chars dropped, numbers, empties skipped', () => {
  const p = X.buildParts(simple), s = p['xl/worksheets/sheet1.xml'], styles = p['xl/styles.xml'];
  const sOf = (ref) => (new RegExp('<c r="' + ref + '" s="(\\d+)"').exec(s) || [])[1];
  const xfs = [...styles.matchAll(/<xf numFmtId[^>]*?(?:\/>|>.*?<\/xf>)/g)].map((m) => m[0]).slice(1);   // [0] = cellStyleXfs
  assert.match(xfs[Number(sOf('A2'))], /readingOrder="2"/, 'Hebrew column is right-to-left');
  assert.match(xfs[Number(sOf('A1'))], /applyFill="1"/, 'header is filled');
  assert.match(s, /<c r="A2" s="\d+" t="inlineStr"><is><r><t xml:space="preserve">כָּתַב<\/t><\/r><\/is><\/c>/);
  assert.match(s, /писать &lt;&amp;&gt; &quot;x&quot;/);
  assert.match(s, /<c r="C2"><v>3<\/v><\/c>/);
  assert.match(s, /<c r="C3"><v>0<\/v><\/c>/);
  assert.ok(!/r="B3"/.test(s), 'an empty unstyled cell is not written');
  assert.ok(!/\u0007/.test(s));
  assert.match(s, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(s, /<autoFilter ref="A1:C4"\/>/);
});

test('links, rich text, formulas, conditional formats, print setup', () => {
  const book = {
    styles: { ok: { font: { color: 'FF1E7B4F' }, fill: 'FFE3F4EA' }, date: { numFmt: 'yyyy-mm-dd' } },
    sheets: [
      { name: 'Начать', header: false, selected: true, rows: [[{ v: 'К словам ›', link: { sheet: 'Слова', ref: 'A2' } }], [{ v: 'Pealim ↗', link: { url: 'https://www.pealim.com/dict/1/' } }]] },
      { name: 'Слова', freeze: { rows: 1, cols: 1 }, columns: [{ header: 'Слово', rtl: true }, { header: 'Срок' }, { header: 'Ответ' }, { header: 'Проверка' }],
        rows: [[{ rich: [{ t: 'הִיא ' }, { t: 'כָּתְבָה', b: true }] }, { v: 46308, s: 'date' }, '', { f: '=IF(C2="","",IF(C2="כתבה","✓","✗"))' }]],
        condFormats: [{ ref: 'D2:D9', rules: [{ type: 'beginsWith', text: '✓', style: 'ok' }] }, { ref: 'B2:B9', rules: [{ type: 'expression', formula: 'AND(B2<>"",B2<=TODAY())', style: 'ok' }] }, { ref: 'E2:E9', rules: [{ type: 'dataBar' }] }],
        print: { landscape: true, fitWidth: true, titleRows: 1 } },
    ],
  };
  const p = X.buildParts(book), s1 = p['xl/worksheets/sheet1.xml'], s2 = p['xl/worksheets/sheet2.xml'];
  assert.match(s1, /<hyperlink ref="A1" location="'Слова'!A2" display="A1"\/>/);
  assert.match(s1, /<hyperlink ref="A2" r:id="rId1"\/>/);
  assert.match(p['xl/worksheets/_rels/sheet1.xml.rels'], /Target="https:\/\/www\.pealim\.com\/dict\/1\/" TargetMode="External"/);
  assert.match(s2, /<r><rPr><b\/><\/rPr><t xml:space="preserve">כָּתְבָה<\/t><\/r>/);
  assert.match(s2, /<c r="D2" t="str"><f>IF\(C2=&quot;&quot;,&quot;&quot;,IF\(C2=&quot;כתבה&quot;,&quot;✓&quot;,&quot;✗&quot;\)\)<\/f><\/c>/);
  assert.match(s2, /<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"\/>/);
  assert.match(s2, /<cfRule type="beginsWith" dxfId="0"[^>]*text="✓"><formula>LEFT\(D2,1\)="✓"<\/formula>/);
  assert.match(s2, /<cfRule type="expression" dxfId="0"[^>]*><formula>AND\(B2&lt;&gt;&quot;&quot;,B2&lt;=TODAY\(\)\)<\/formula>/);
  assert.match(s2, /<cfRule type="dataBar"/);
  assert.match(s2, /<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/);
  assert.match(p['xl/workbook.xml'], /<definedName name="_xlnm.Print_Titles" localSheetId="1">'Слова'!\$1:\$1<\/definedName>/);
  assert.match(p['xl/styles.xml'], /<numFmt numFmtId="164" formatCode="yyyy-mm-dd"\/>/);
  assert.match(p['xl/styles.xml'], /<dxfs count="1">/, 'one dxf reused by two rules');
  assert.match(p['[Content_Types].xml'], /sheet2\.xml/);
});

test('zipped with JSZip, the workbook reads back', async () => {
  const zip = new JSZip();
  Object.entries(X.buildParts(simple)).forEach(([k, v]) => zip.file(k, v));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  const back = await JSZip.loadAsync(buf);
  assert.match(await back.file('xl/worksheets/sheet1.xml').async('string'), /שָׁמַע/);
});
