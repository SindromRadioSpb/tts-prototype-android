'use strict';
// Every lesson's hard-answer probes run through the real checker; a wrong verdict fails the suite.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const C = require('../public/js/course-checker.js');
const { runProbes } = require('../scripts/course/verify-hebrew.cjs');

const courses = [path.join(__dirname, '../content/course/ulpan')];
for (const dir of courses) {
  const probeDir = path.join(dir, 'probes');
  if (!fs.existsSync(probeDir)) continue;
  for (const file of fs.readdirSync(probeDir).filter(f => f.endsWith('.json'))) {
    test('probes ' + path.basename(dir) + '/' + file, () => {
      const failures = runProbes(dir, file.replace(/\.json$/, ''));
      assert.deepEqual(failures, [], failures.map(f => f.taskId + ' «' + f.input + '»: ждали ' + f.expect + ', получили ' + f.got + ' — ' + f.why).join('\n'));
    });
  }
}

test('runProbes reports a probe whose verdict differs, with its reason', t => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probes-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(__dirname, 'fixtures/course/mini'), dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'probes'));
  fs.writeFileSync(path.join(dir, 'probes/L001-cafe.json'), JSON.stringify([
    { taskId: '6', input: 'תֵּה בְּלִי סֻכָּר', expect: 'accepted', why: 'огласованный ответ (H1)' },
    { taskId: '6', input: 'תה עם סוכר', expect: 'accepted', why: 'намеренно неверная проба' }
  ]));
  const failures = runProbes(dir, 'L001-cafe');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].why, 'намеренно неверная проба');
  assert.equal(failures[0].got, 'mismatch');
});

test('verifyLesson marks Pealim matches, niqqud differences and unknown words', t => {
  const os = require('node:os');
  const { verifyLesson } = require('../scripts/course/verify-hebrew.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(__dirname, 'fixtures/course/mini'), dir, { recursive: true });
  const file = path.join(dir, 'lessons/L001-cafe.json'), l = JSON.parse(fs.readFileSync(file, 'utf8'));
  l.scene.turns[0].he = { niqqud: 'סֻכָּר קְפוּדוּל גָּדֹל', plain: 'סוכר קפודול גדול' };
  fs.writeFileSync(file, JSON.stringify(l));
  const report = verifyLesson(dir, 'L001-cafe');
  const by = w => report.find(r => r.plain === w);
  assert.equal(by('סוכר').pealim, 'match');
  assert.equal(by('קפודול').pealim, 'absent');
  assert.equal(by('גדול').pealim, 'differs');
  assert.equal(by('גדול').pealimForm, 'גָּדוֹל');
});
