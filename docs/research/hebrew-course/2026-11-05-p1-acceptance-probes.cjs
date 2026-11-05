// Independent acceptance probes for P1 (not in the plan's test table).
const path = require('path');
const root = process.argv[2];
const C = require(path.join(root, 'public/js/course-checker.js'));
const fx = p => require(path.join(root, 'tests/fixtures/course/mini', p));
const lesson = fx('lessons/L001-cafe.json');
const lexicon = fx('lexicon.json');
const index = C.buildIndex(lexicon.entries);
const task = id => lesson.tasks.find(t => t.id === id);
const cases = [
  ['6', 'אֶפְשָׁר תֵּה בְּלִי סוּכָּר', 'accepted', 'functional spelling'],
  ['6', 'בבקשה, תה בלי סוכר', 'accepted', 'frame first'],
  ['6', 'אפשר תה בלי סוכר בלי סוכר', 'accepted', 'repeated same value'],
  ['6', 'אפשר מים בלי סוכר', 'mismatch', 'wrong drink'],
  ['6', 'אפשר תה בלי סוכר ועם חלב', 'unknown', 'conjunction not taught'],
  ['6', 'אפשר תה לא עם סוכר', 'accepted|unknown', 'negated opposite'],
  ['9', 'קפה גדול עם חלב', 'accepted', 'no efshar'],
  ['9', 'אפשר קפה קטן עם חלב', 'mismatch', 'wrong size'],
  ['10a', 'קפה', 'partial|unknown|mismatch', 'answers drink, not service'],
  ['19d', 'לא', 'partial|mismatch', 'no correction'],
  ['19d', 'כן, בלי חלב', 'accepted', 'yes + correction'],
  ['19d', 'עם חלב', 'mismatch', 'repeats wrong claim'],
  ['13', 'עוד פעם, בבקשה', 'accepted', 'repeat + please'],
  ['13', 'סליחה', 'accepted|unknown', 'bare sorry'],
  ['18b', 'במקום תה, קפה', 'mismatch|unknown', 'inverted syntax'],
  ['18b', 'קפה במקום תה, בבקשה', 'accepted', 'no efshar'],
  ['6', '__proto__ constructor toString', 'unknown', 'prototype names'],
  ['6', 'תה '.repeat(3000), 'unknown|partial|accepted', 'very long input'],
];
let bad = 0;
for (const [id, input, want, note] of cases) {
  let r; const t0 = Date.now();
  try { r = C.assess(input, task(id), lesson, index); } catch (e) { r = { kind: 'CRASH ' + e.message }; }
  const ok = want.split('|').includes(r.kind) && Date.now() - t0 < 500;
  if (!ok) bad++;
  console.log((ok ? 'ok  ' : 'BAD ') + id.padEnd(6) + note.padEnd(26) + r.kind.padEnd(9) + ' ' + ((r.message && r.message.ru) || '').slice(0, 90));
}
console.log('bad =', bad);
