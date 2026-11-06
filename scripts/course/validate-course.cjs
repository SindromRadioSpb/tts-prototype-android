'use strict';
const fs = require('node:fs'), path = require('node:path');
const R = require('../../public/js/course-review.js');
const F = require('../../public/js/course-format.js');
const { checkGraph } = require('./course-graph.cjs');
function validateCourseDir(dir) {
  const issues = [];
  const error = (code, p, message) => issues.push({ level: 'error', code, path: p, message });
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
  function run() {
    const root = fs.realpathSync(dir);
    const read = relative => {
      const target = fs.realpathSync(path.resolve(root, relative));
      const rel = path.relative(root, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Путь выходит за каталог курса.');
      return JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
    };
    const course = read('course.json');
    if (!course || typeof course !== 'object' || Array.isArray(course)) { error('FORMAT', 'course', 'Ожидается объект курса.'); return; }
    if (course.format !== 'course-v1' || !Number.isInteger(course.version) || course.version < 1 || typeof course.title?.ru !== 'string' || !course.title.ru.trim()) error('FORMAT', 'course', 'Нужны course-v1, положительная версия и title.ru.');
    if (!validId(course.id)) error('ID_BAD', 'course.id', 'Некорректный ID курса.');
    for (const field of ['lessons', 'preknown']) {
      if (!Array.isArray(course[field])) { error('FORMAT', 'course.' + field, 'Ожидается массив ID.'); continue; }
      const seen = new Set();
      for (const id of course[field]) { if (!validId(id)) error('ID_BAD', 'course.' + field, 'Некорректный ID.'); else if (seen.has(id)) error('ID_DUP', 'course.' + field, 'Повторный ID: ' + id); seen.add(id); }
    }
    if (typeof course.lexicon !== 'string' || !course.lexicon || path.isAbsolute(course.lexicon) || course.lexicon.split(/[\\/]/).includes('..')) error('FORMAT', 'course.lexicon', 'Нужен относительный путь внутри курса.');
    if (course.reviewPlan !== undefined) issues.push(...R.validatePlan(course.reviewPlan, course));
    if (issues.length) return;
    const lexicon = read(course.lexicon);
    issues.push(...F.validateLexicon(lexicon));
    if (issues.some(i => i.level === 'error')) return;
    const index = new Map(lexicon.entries.flatMap(e => [[e.id, e], ...(e.forms || []).map(f => [f.id, f])]));
    course.preknown.forEach(id => { if (!index.has(id)) error('REF_UNKNOWN', 'course.preknown', 'Неизвестная единица: ' + id); });
    const lessons = course.lessons.map(id => {
      const lesson = read('lessons/' + id + '.json');
      issues.push(...F.validateLesson(lesson, index).map(i => ({ ...i, lessonId: id })));
      if (lesson?.id !== id) error('FORMAT', 'lessons/' + id, 'ID урока не совпадает с манифестом.');
      return lesson;
    });
    if (!issues.some(i => i.level === 'error')) issues.push(...checkGraph({ course, lexicon, lessons }));
  }
  try { run(); } catch (e) { error('FORMAT', '', 'Не удалось прочитать курс: ' + e.message); }
  return issues;
}
module.exports = { validateCourseDir };

if (require.main === module) {
  const args = process.argv.slice(2), json = args.includes('--json');
  const dirs = args.filter(a => a !== '--json');
  const issues = dirs.length !== 1 || dirs[0].startsWith('--')
    ? [{ level: 'error', code: 'FORMAT', path: '', message: 'Использование: course:validate <courseDir> [--json]' }]
    : validateCourseDir(dirs[0]);
  if (json) console.log(JSON.stringify(issues, null, 2));
  else for (const i of issues) console.log([i.level, i.code, i.lessonId || '-', i.path || '-', i.message].join(' '));
  process.exitCode = issues.some(i => i.level === 'error') ? 1 : 0;
}
