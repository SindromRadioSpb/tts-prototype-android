const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { parseHTML } = require('linkedom');
const api = require('../scripts/course/course-tts.cjs');
const fixture = path.join(__dirname, 'fixtures/course/mini');
test('standalone sheet preserves eight keyed RTL clips and exports only explicit reviews', async t => {
  assert.equal(typeof api.buildListeningSheet, 'function');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-sheet-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const items = api.inventory(fixture, { lesson: 'L001-cafe', outDir: dir }).items;
  const html = api.buildListeningSheet('L001-cafe', items, [
    { ref: items[0].ref, key: items[0].assetKey, asr: '<img src=x onerror=alert(1)>' },
    { ref: items[1].ref, key: 'stale', asr: 'STALE-ASR' }
  ]);
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('audio').length, 8);
  const rows = [...document.querySelectorAll('[data-ref]')];
  rows.forEach((row, i) => {
    assert.equal(row.dataset.key, items[i].assetKey);
    assert.equal(row.querySelector('[lang=he]').getAttribute('dir'), 'rtl');
    assert.equal(row.querySelector('[lang=he]').textContent, items[i].text);
    assert.equal(row.querySelector('audio').getAttribute('src'), items[i].assetKey + '.mp3');
    assert.equal(row.querySelector('select').value, 'UNREVIEWED');
  });
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.ok(document.body.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.ok(!document.body.textContent.includes('STALE-ASR'));
  let captured;
  const context = { document, Blob, URL: { createObjectURL(blob) { captured = blob; return 'blob:test'; }, revokeObjectURL() {} }, Date };
  vm.runInNewContext(document.querySelector('script').textContent, context);
  context.downloadMarks();
  assert.deepEqual(JSON.parse(await captured.text()).items, {});
  rows.forEach((row, i) => {
    row.querySelector('option[selected]').removeAttribute('selected');
    row.querySelector('option[value="' + (i % 2 ? 'bad' : 'ok') + '"]').setAttribute('selected', '');
    row.querySelector('textarea').value = 'note ' + i;
  });
  context.downloadMarks();
  const marks = JSON.parse(await captured.text());
  assert.equal(marks.lessonId, 'L001-cafe');
  assert.ok(Number.isFinite(Date.parse(marks.reviewedAt)));
  items.forEach((item, i) => assert.deepEqual(marks.items[item.ref], { key: item.assetKey, status: i % 2 ? 'bad' : 'ok', note: 'note ' + i }));
  fs.writeFileSync(path.join(dir, 'asr-check.json'), JSON.stringify([{ ref: items[0].ref, key: items[0].assetKey, asr: 'MATCHED-ASR' }]));
  const cli = spawnSync(process.execPath, [path.join(__dirname, '../scripts/course/course-tts.cjs'), 'sheet', fixture, '--lesson', 'L001-cafe', '--out', dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'listen-L001-cafe.html'), 'utf8'), /MATCHED-ASR/);
});
