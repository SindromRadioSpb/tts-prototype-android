'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseHTML } = require('linkedom');
const F = require('../public/js/course-format');
const C = require('../public/js/course-checker');
const E = require('../public/js/course-evidence');
const S = require('../public/js/course-store');
const R = require('../public/js/course-reader');
const { validateCourseDir } = require('../scripts/course/validate-course.cjs');
const { buildCourseData } = require('../scripts/course/build-course-data.cjs');
const root = path.resolve(__dirname, '..');
const courseId = 'ulpan-cafe-b-pilot';
const source = path.join(root, 'content/course', courseId);
const read = file => JSON.parse(fs.readFileSync(path.join(source, file), 'utf8'));
const course = read('course.json');
const lexicon = read('lexicon.json');
const lessons = course.lessons.map(id => read('lessons/' + id + '.json'));
const index = C.buildIndex(lexicon.entries);
index.preknown = course.preknown;

test('B pilot is a separate native course with explicit foundations, no fabricated preknowledge', () => {
  assert.equal(course.id, courseId);
  assert.match(course.id, /^[a-z0-9-]{1,40}$/);
  assert.deepEqual(course.preknown, []);
  assert.deepEqual(course.lessons, ['B000-foundations', 'B001-cafe']);
  const errors = validateCourseDir(source).filter(i => i.level === 'error');
  assert.deepEqual(errors, []);
  assert.equal(lessons[1].introduces.active.length, 8);
  assert.equal(lessons[0].introduces.active.filter(id => lexicon.entries.some(e => e.id === id)).length, 14);
  assert.equal(lessons[0].introduces.active.length, 15, 'the feminine reading is an explicit form, not a fifteenth lemma');
  assert.equal(lessons.some(l => l.id === 'L001-cafe'), false);
  for (const lesson of lessons) {
    assert.equal(lesson.format, 'course-lesson-v1');
    assert.ok(lesson.flow.length > 0);
    assert.ok(lesson.flow.flatMap(p => p.steps).some(st => Object.hasOwn(st, 'metLexIds')));
    for (const task of lesson.tasks) assert.ok(Array.isArray(task.evidenceLexIds), lesson.id + '/' + task.id);
  }
});

test('pilot request guard does not turn absence, negated wishes, or meaning questions into successful orders', () => {
  const lesson = lessons[1], task = lesson.tasks.find(t => t.id === 'B-E05-2');
  assert.equal(task.spec.requestOnly, true);
  for (const input of ['אני לא רוצה קפה גדול עם חלב', 'אין קפה גדול עם חלב', 'יש קפה גדול עם חלב', 'מה זה קפה גדול עם חלב', 'לא אפשר קפה גדול עם חלב', 'קפה גדול עם חלב לא'])
    assert.equal(C.assess(input, task, lesson, index).kind, 'unknown', input);
  for (const input of ['אפשר קפה גדול עם חלב, בבקשה?', 'קפה גדול עם חלב', 'אני רוצה קפה גדול עם חלב'])
    assert.equal(C.assess(input, task, lesson, index).kind, 'accepted', input);
  for (const input of ['אפשר קפה קטן עם חלב', 'אפשר קפה גדול בלי חלב'])
    assert.equal(C.assess(input, task, lesson, index).kind, 'mismatch', input);
  for (const [id, negatives, positives] of [
    ['B-E05-3', ['אני לא רוצה גדול', 'אין גדול'], ['גדול, בבקשה']],
    ['B-E09-2', ['אני לא רוצה בלי חלב', 'אין בלי חלב'], ['לא, בלי חלב, בבקשה', 'בלי חלב']],
    ['B-E09-4', ['אני לא רוצה גדול', 'אין גדול'], ['לא, גדול, בבקשה', 'גדול']]
  ]) {
    const correction = lesson.tasks.find(t => t.id === id);
    assert.equal(correction.spec.requestOnly, true);
    for (const input of negatives) assert.equal(C.assess(input, correction, lesson, index).kind, 'unknown', id + ': ' + input);
    for (const input of positives) assert.equal(C.assess(input, correction, lesson, index).kind, 'accepted', id + ': ' + input);
  }
  const invalid = structuredClone(lesson);
  invalid.tasks.find(t => t.id === 'B-E05-2').spec.requestOnly = 'yes';
  const map = new Map(lexicon.entries.flatMap(e => [[e.id, e], ...(e.forms || []).map(f => [f.id, f])]));
  assert.ok(F.validateLesson(invalid, map).some(i => i.path.endsWith('requestOnly')));
});

test('B automated authored models and return variants satisfy the native checker', () => {
  let checked = 0;
  for (const lesson of lessons) for (const base of lesson.tasks) {
    for (const task of [base, ...(base.variants || []).map(v => ({ ...base, ...v, id: base.id }))]) {
      if (!task.spec || !task.model || ['choice', 'match'].includes(task.type)) continue;
      const result = C.assess(task.model.plain, task, lesson, index);
      assert.equal(result.kind, 'accepted', lesson.id + '/' + base.id + ': ' + JSON.stringify(result));
      checked++;
    }
  }
  assert.ok(checked >= 10, 'meaningful automated coverage rather than a static document');
});

test('B bundle and legacy bundle coexist without changing legacy bytes or inventing media', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-cafe-b-build-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const oldManifest = buildCourseData(path.join(root, 'content/course/ulpan'), temp);
  const oldCourse = fs.readFileSync(path.join(temp, 'ulpan/course.json'));
  const oldLesson = fs.readFileSync(path.join(temp, 'ulpan/lessons/L001-cafe.json'));
  const manifest = buildCourseData(source, temp);
  assert.deepEqual(fs.readFileSync(path.join(temp, 'ulpan/course.json')), oldCourse);
  assert.deepEqual(fs.readFileSync(path.join(temp, 'ulpan/lessons/L001-cafe.json')), oldLesson);
  assert.equal(oldManifest.courseId, 'ulpan');
  assert.equal(manifest.courseId, courseId);
  assert.equal(Object.keys(manifest.files).some(p => p.startsWith('audio/') || p.startsWith('media/')), false);
  for (const lesson of lessons) for (const task of lesson.tasks) {
    assert.equal(task.channel.includes('listen'), false, 'no unvalidated listening claims');
    assert.equal(Object.hasOwn(task, 'audioTurnId'), false);
  }
});

function environment() {
  const { document, window } = parseHTML('<html><body><main></main></body></html>');
  const values = new Map();
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const store = S.localStore(storage, { userKey: 'pilot-fixture-user' });
  const legacy = E.emptyProgress('ulpan');
  legacy.reader = { position: { lessonId: 'L001-cafe', step: 7 }, tasks: { 'L001-cafe/sentinel': { input: 'ישן' } } };
  legacy.firstMet = { sentinel: 123 };
  assert.equal(store.save(legacy).ok, true);
  const before = JSON.stringify(store.load('ulpan').progress);
  const data = { 'course.json': course, 'lexicon.json': lexicon };
  for (const lesson of lessons) data['lessons/' + lesson.id + '.json'] = lesson;
  const opts = { courseId, store, storage, T: (_key, fallback) => fallback, now: () => 10000,
    fetch: async url => {
      const value = data[url.split('/' + courseId + '/')[1]];
      return { ok: !!value, json: async () => structuredClone(value) };
    } };
  return { document, window, store, storage, before, mount: () => R.factory(document).mount(document.querySelector('main'), opts) };
}

test('native pilot keeps legacy progress byte-identical through entry, answer, aid, and reload', async () => {
  const env = environment();
  let reader = env.mount();
  await reader.home();
  assert.equal(env.document.querySelectorAll('[data-course-lesson]').length, 2);
  const main = lessons[1];
  const task = main.tasks.find(t => t.spec && t.model && t.type === 'text' && t.evidenceLexIds.length > 0 && t.evidenceLexIds.length < 8);
  assert.ok(task, 'one bounded text retrieval');
  const steps = main.flow.flatMap(p => p.steps);
  const step = steps.findIndex(s => s.kind === 'task' && s.ref === task.id);
  await reader.openLesson(main.id, step);
  const input = env.document.querySelector('[data-course-input]');
  input.value = task.model.plain;
  input.dispatchEvent(new env.window.Event('input'));
  env.document.querySelector('[data-course-check]').click();
  const attempt = env.store.load(courseId).progress.attempts.at(-1);
  assert.equal(attempt.kind, 'accepted');
  assert.deepEqual(attempt.lexIds, task.evidenceLexIds);
  assert.equal(attempt.channel, 'write_he');
  assert.equal(E.attemptLevel(attempt), 'independent');
  env.document.querySelector('[data-course-model]').click();
  reader.destroy();
  reader = env.mount();
  await reader.openLesson(main.id);
  assert.equal(env.document.querySelector('[data-course-input]').value, task.model.plain);
  assert.equal(env.document.querySelector('[data-course-model]').getAttribute('aria-expanded'), 'true');
  assert.equal(JSON.stringify(env.store.load('ulpan').progress), env.before);
  const otherUser = S.localStore(env.storage, { userKey: 'different-pilot-user' });
  assert.equal(otherUser.load(courseId).progress.attempts.length, 0);
  assert.throws(() => E.mergeProgress(env.store.load('ulpan').progress, env.store.load(courseId).progress), /COURSE_MISMATCH/);
  reader.destroy();
});

test('opening the main pilot does not claim all prerequisite or target words encountered', async () => {
  const env = environment(), reader = env.mount();
  await reader.openLesson('B001-cafe', 0);
  const progress = env.store.load(courseId).progress;
  assert.equal(progress.attempts.length, 0);
  assert.ok(Object.keys(progress.firstMet).length < 8);
  assert.equal(E.courseCounts(progress, lexicon, lessons).produced, 0);
  assert.equal(JSON.stringify(env.store.load('ulpan').progress), env.before);
  reader.destroy();
});
