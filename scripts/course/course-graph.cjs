'use strict';
const H = require('../../public/js/course-hebrew.js');
const C = require('../../public/js/course-checker.js');

// Preserve every homograph candidate; multiword entries cover their full span.
function scan(he, index) {
  const words = H.tokens(he.plain);
  const candidates = words.map(() => new Set());
  for (let start = 0; start < words.length; start++) {
    for (let end = start + 1; end <= words.length; end++) {
      const entries = (end === start + 1 ? index : index.multiword).get(words.slice(start, end).join(' ')) || [];
      for (const entry of entries) for (let i = start; i < end; i++) candidates[i].add(entry.lexId);
    }
  }
  return words.map((word, i) => ({ word, ids: candidates[i] }));
}

// Input is format-validated by the CLI; callers must do the same.
function checkGraph({ course, lexicon, lessons }) {
  const index = C.buildIndex(lexicon.entries), issues = [], learned = new Set(course.preknown);
  const add = (lesson, code, path, message, level = 'error') => issues.push({ level, code, lessonId: lesson.id, path, message });
  const material = l => [...l.scene.turns.map(t => t.he), ...(l.text?.paras || []).map(p => p.he), ...l.tasks.flatMap(t => t.model ? [t.model] : [])];
  const seen = lessons.map(l => new Set(material(l).flatMap(he => scan(he, index).flatMap(t => [...t.ids]))));
  lessons.forEach((lesson, lessonIndex) => {
    const introduced = new Set([...lesson.introduces.active, ...lesson.introduces.receptive]);
    introduced.forEach(id => learned.add(id));
    if (!lesson.tasks.some(t => t.transfer === true)) add(lesson, 'NO_TRANSFER', 'tasks', 'В уроке нет задания на перенос.');
    const requireId = (id, p) => { if (!learned.has(id)) add(lesson, 'REQUIRES_UNMET', p, 'Единица ещё не введена: ' + id); };
    lesson.frame.forEach((id, i) => requireId(id, 'frame[' + i + ']'));
    lesson.repeatForms.forEach((seq, i) => seq.forEach((id, j) => requireId(id, 'repeatForms[' + i + '][' + j + ']')));
    lesson.slots.forEach((s, i) => s.values.forEach((v, j) => v.seq.forEach((id, k) => requireId(id, 'slots[' + i + '].values[' + j + '].seq[' + k + ']'))));
    lesson.tasks.forEach((task, i) => {
      const pairs = [...(task.model ? [[task.model, 'model']] : []), ...(task.answers || []).map((he, j) => [he, 'answers[' + j + ']'])];
      for (const [he, field] of pairs) for (const token of scan(he, index)) {
        if (![...token.ids].some(id => learned.has(id))) add(lesson, 'REQUIRES_UNMET', 'tasks[' + i + '].' + field, 'Неизученное слово: ' + token.word);
      }
    });
    const text = (lesson.text?.paras || []).flatMap((p, i) => scan(p.he, index).map(t => ({ ...t, path: 'text.paras[' + i + '].he' })));
    for (const token of text) if (!token.ids.size) add(lesson, 'TEXT_UNKNOWN_TOKEN', token.path, 'Слово отсутствует в лексиконе: ' + token.word);
    // Words the learner already met in this lesson's scene or tasks are not new by the time the text comes.
    const metPairs = [...lesson.scene.turns.flatMap(t => [t.he, ...(t.choices || []).map(c => c.he)]),
      ...lesson.tasks.flatMap(t => [t.model, t.cue, ...(t.tiles || []), ...(t.options || []).map(o => o.he), ...(t.pairs || []).map(p => p.he)].filter(Boolean))];
    const met = new Set(metPairs.flatMap(he => scan(he, index).flatMap(t => [...t.ids])));
    for (const e of lexicon.entries) if (e.pos === 'name') met.add(e.id);
    const fresh = text.filter(t => [...t.ids].some(id => introduced.has(id)) && ![...t.ids].some(id => met.has(id))).length;
    if (text.length && fresh / text.length > 0.08) add(lesson, 'TEXT_DENSITY', 'text', 'Доля новых слов: ' + (fresh / text.length).toFixed(3) + ' (порог 0.08).', 'warning');
    for (const id of lesson.introduces.active) {
      const later = seen.slice(lessonIndex + 1);
      if (later.length < 3) add(lesson, 'REAPPEAR_PENDING', 'introduces.active.' + id, 'Для проверки нужны ещё три последующих урока: ' + id, 'warning');
      else if (later.filter(ids => ids.has(id)).length < 3) add(lesson, 'REAPPEAR_LOW', 'introduces.active.' + id, 'Единица встречается менее чем в трёх последующих уроках: ' + id, 'warning');
    }
  });
  return issues;
}
module.exports = { checkGraph };
