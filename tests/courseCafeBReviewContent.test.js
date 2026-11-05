'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const course = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/course/ulpan-cafe-b-pilot/course.json'), 'utf8'));
const plan = course.reviewPlan;
const byId = Object.fromEntries(plan.sessions.map(s => [s.id, s]));
const sum = s => s.tasks.flatMap(t => t.rubric).reduce((a, r) => (a[r.id] = (a[r.id] || 0) + r.max, a), {});

test('B review plan preserves the two native lessons and complete source schedule', () => {
  assert.deepEqual(course.lessons, ['B000-foundations', 'B001-cafe']);
  assert.deepEqual(course.preknown, []);
  assert.equal(plan.id, 'cafe-b-review-v1');
  assert.equal(plan.version, 1);
  assert.equal(plan.anchorLessonId, 'B001-cafe');
  assert.deepEqual(plan.sessions.map(s => [s.id, s.day, s.kind]), [
    ['B-R00', 0, 'review'], ['B-R01', 1, 'review'], ['B-R03', 3, 'review'],
    ['B-D07', 7, 'assessment'], ['B-R07', 7, 'review'], ['B-R14', 14, 'review'],
    ['B-D30', 30, 'assessment'], ['B-R30', 30, 'review']
  ]);
  assert.equal(byId['B-R00'].requiresActivityBreak, true);
  assert.equal(byId['B-R07'].after, 'B-D07');
  assert.equal(byId['B-R30'].after, 'B-D30');
});

test('all eight source lexical permutations and four separate gender checks are preserved', () => {
  const expected = {
    'B-R00': ['תה', 'בלי', 'סוכר', 'גדול', 'קפה', 'קטן', 'עם', 'חלב'],
    'B-R01': ['חלב', 'גדול', 'עם', 'קפה', 'סוכר', 'קטן', 'בלי', 'תה'],
    'B-R03': ['עם', 'סוכר', 'קפה', 'בלי', 'קטן', 'חלב', 'תה', 'גדול'],
    'B-R07': ['קטן', 'קפה', 'חלב', 'בלי', 'גדול', 'תה', 'סוכר', 'עם'],
    'B-R14': ['בלי', 'תה', 'גדול', 'סוכר', 'עם', 'חלב', 'קטן', 'קפה'],
    'B-R30': ['סוכר', 'קטן', 'חלב', 'עם', 'תה', 'קפה', 'גדול', 'בלי'],
    'B-D07': ['חלב', 'קטן', 'עם', 'תה', 'גדול', 'סוכר', 'קפה', 'בלי'],
    'B-D30': ['בלי', 'קפה', 'גדול', 'סוכר', 'קטן', 'עם', 'חלב', 'תה']
  };
  for (const session of plan.sessions) {
    assert.deepEqual(session.tasks.slice(0, 8).map(t => t.accepts[0]), expected[session.id]);
    assert.equal(new Set(session.tasks.slice(0, 8).map(t => t.accepts[0])).size, 8);
    assert.deepEqual(session.tasks.slice(8, 12).map(t => t.rubric[0].id), Array(4).fill('gender'));
    for (const task of session.tasks.slice(8, 12)) assert.ok(task.accepts.includes('мужской'));
    assert.equal(session.tasks.slice(12).some(t => Object.hasOwn(t, 'accepts')), false, 'open actions must not claim exact automatic checking');
  }
});

test('source rubric dimensions stay separate and exact; no compensated mastery total', () => {
  for (const session of plan.sessions.filter(s => s.kind === 'review')) {
    assert.equal(session.tasks.length, 15);
    assert.deepEqual(sum(session), { lexical: 8, gender: 4, actions: 3 });
  }
  assert.deepEqual(sum(byId['B-D07']), { lexical: 8, gender: 4, comprehension: 5, replacement: 4, repair: 1, staff: 2 });
  assert.deepEqual(sum(byId['B-D30']), { lexical: 8, gender: 4, 'initial-order': 4, comprehension: 5, replacement: 4, confirmation: 2, staff: 2 });
  assert.equal(plan.sessions.reduce((n, s) => n + s.tasks.length, 0), 123);
});

test('all review tasks have stable unique IDs, substantive keys, localized text and bounded criteria', () => {
  const seen = new Set();
  for (const session of plan.sessions) {
    assert.ok(session.title.ru.trim());
    assert.match(session.instructions.ru, /Ключи открывайте только после всей серии/);
    assert.match(session.instructions.ru, /Слух и произношение не проверены/);
    for (const task of session.tasks) {
      assert.ok(task.id.startsWith(session.id + '-'));
      assert.ok(!seen.has(task.id)); seen.add(task.id);
      assert.ok(task.prompt.ru.trim());
      assert.ok(task.key.ru.length > 80, task.id);
      if (task.stimulus) assert.ok(task.stimulus.ru.trim());
      assert.ok(task.rubric.length);
      assert.equal(new Set(task.rubric.map(r => r.id)).size, task.rubric.length);
      for (const r of task.rubric) { assert.ok(r.label.ru.trim()); assert.ok(Number.isInteger(r.max) && r.max > 0); }
      if (task.accepts) assert.ok(task.accepts.every(x => typeof x === 'string' && x.length));
    }
  }
});

test('delayed stimuli remain on their own steps and do not leak into earlier prompts', () => {
  const d07 = byId['B-D07'].tasks;
  assert.equal(d07.find(t => t.id === 'B-D07-1').stimulus.ru, 'שלום,\nאני רוצה קפה גדול בלי חלב, בלי סוכר.\nתודה.');
  assert.match(d07.find(t => t.id === 'B-D07-1').prompt.ru, /один раз, затем закройте/);
  assert.equal(d07.find(t => t.id === 'B-D07-2').stimulus.ru, 'אין קפה גדול. יש קפה קטן. יש תה גדול.');
  const d30 = byId['B-D30'].tasks;
  assert.equal(d30.find(t => t.id === 'B-D30-1').stimulus, undefined);
  assert.equal(d30.find(t => t.id === 'B-D30-2-facts').stimulus.ru, 'אין תה. אין קפה גדול. יש קפה קטן. אין חלב. יש סוכר.');
  assert.equal(d30.find(t => t.id === 'B-D30-2-order').stimulus, undefined);
  assert.equal(d30.find(t => t.id === 'B-D30-3').stimulus.ru, 'קפה קטן בלי חלב, עם סוכר?');
  for (const session of plan.sessions) for (const task of session.tasks.slice(0, 12)) assert.equal(task.stimulus, undefined);
});

test('R30 remains self-selected and previously exposed assessments remain practice', () => {
  const own = byId['B-R30'].tasks.slice(12);
  assert.ok(own.every(t => !t.accepts));
  assert.match(own[0].key.ru, /по своей русской карточке/);
  assert.match(own[1].prompt.ru, /известную подмену как репетицию/);
  assert.match(own[2].key.ru, /смену только напитка/);
  for (const id of ['B-D07', 'B-D30']) assert.match(byId[id].instructions.ru, /повтор является практикой, а не отложенным независимым контролем/);
});

test('each R action has authored new repair practice; assessments do not invent independent new versions', () => {
  let count = 0;
  for (const session of plan.sessions) for (const task of session.tasks) {
    if (session.kind === 'review' && task.rubric.some(r => r.id === 'actions')) {
      assert.ok(task.repair?.prompt.ru.length > 80, task.id);
      assert.ok(task.repair?.key.ru.length > 80, task.id);
      assert.notEqual(task.repair.prompt.ru, task.prompt.ru);
      assert.match(task.repair.prompt.ru, /практика.*не новый независимый контроль/);
      assert.match(task.repair.key.ru, /Сверка самостоятельная/);
      count++;
    } else assert.equal(task.repair, undefined, task.id);
  }
  assert.equal(count, 18);
  const note = byId['B-R14'].tasks.find(t => t.id === 'B-R14-1');
  assert.equal(note.stimulus.ru, 'אני רוצה תה גדול בלי חלב, עם סוכר. תודה.');
  assert.match(note.prompt.ru, /закройте записку/);
  assert.equal(byId['B-R14'].tasks.find(t => t.id === 'B-R14-2').stimulus, undefined);
});

test('every review and assessment preflight withholds Hebrew target forms before lexical retrieval',()=>{
 for(const session of plan.sessions){
  assert.doesNotMatch(session.instructions.ru,/[\u05D0-\u05EA]/,session.id+' preflight must not show Hebrew answers');
  for(const task of session.tasks.slice(0,8))for(const answer of task.accepts)assert.ok(!session.instructions.ru.includes(answer),session.id+' leaks '+answer);
  assert.match(session.instructions.ru,/Огласовки при письме необязательны/);
 }
});
