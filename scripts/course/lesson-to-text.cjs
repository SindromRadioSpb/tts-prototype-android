'use strict';
// Human-readable lesson for a blind reviewer and for media briefs: everything the learner meets, with answers.
const he = pair => pair ? pair.niqqud + (pair.plain && pair.plain !== pair.niqqud ? '  (' + pair.plain + ')' : '') : '';
const ru = x => (x && x.ru) || '';

function sceneLines(lesson) {
  const out = ['## Сцена', ''];
  const roles = new Map((lesson.scene.roles || []).map(r => [r.id, r.voice]));
  for (const t of lesson.scene.turns) {
    out.push('- **' + t.id + '** · ' + t.role + (roles.get(t.role) ? ' (' + roles.get(t.role) + ')' : '') + ': ' + he(t.he) + ' — ' + ru(t.ru));
    for (const c of t.choices || []) out.push('  - ветка «' + c.id + '» (' + c.verdict + ') → ' + c.next + ': ' + he(c.he) + ' — ' + ru(c.ru));
    if (t.next) out.push('  - дальше → ' + t.next);
  }
  return out.concat('');
}
function textLines(lesson) {
  if (!lesson.text) return [];
  return ['## Учебный текст', '', ...lesson.text.paras.map(p => '- **' + p.id + '**: ' + he(p.he) + ' — ' + ru(p.ru)), ''];
}
function taskLines(task) {
  const out = ['### Задание ' + task.id + ' · ' + task.type + (task.transfer ? ' · перенос' : ''), '', ru(task.prompt), ''];
  if (task.channel) out.push('Каналы: ' + task.channel.join(', '));
  if (task.cue) out.push('Реплика: ' + he(task.cue));
  if (task.audioTurnId) out.push('На слух: реплика ' + task.audioTurnId);
  for (const o of task.options || []) out.push('- вариант ' + o.id + (o.id === task.correctOption ? ' (верный)' : '') + ': ' + (o.he ? he(o.he) : ru(o.label)));
  for (const p of task.pairs || []) out.push('- пара ' + p.id + ': ' + he(p.he) + ' ↔ ' + (p.media ? 'картинка ' + p.media : ru(p.label)));
  if (task.tiles) out.push('Плитки: ' + task.tiles.map(he).join(' | ') + (task.distractors?.length ? '; лишние: ' + task.distractors.map(he).join(' | ') : ''));
  if (task.card) out.push('Карточка заказа: ' + Object.entries(task.card).map(([k, v]) => k + '=' + v).join(', ') + (task.cardMedia ? ' (картинка ' + task.cardMedia + ')' : ''));
  if (task.spec) out.push('Проверка: ' + JSON.stringify(task.spec));
  if (task.model) out.push('Образец: ' + he(task.model));
  for (const a of task.answers || []) out.push('Принимается также: ' + he(a));
  for (const [i, h] of (task.hints || []).entries()) out.push('Подсказка ' + (i + 1) + ': ' + ru(h));
  for (const v of task.variants || []) out.push('Вариант возвращения ' + v.id + ': ' + ru(v.prompt) + (v.model ? ' — образец ' + he(v.model) : ''));
  return out.concat('');
}
function lessonToMarkdown(lesson) {
  const out = ['# ' + ru(lesson.title) + ' (' + lesson.id + ', версия ' + lesson.version + ')', '', '**Цель:** ' + ru(lesson.goal), ''];
  if (Array.isArray(lesson.flow)) {
    out.push('## Ход урока', '');
    for (const part of lesson.flow) out.push('- **' + ru(part.title) + '**: ' + part.steps.map(s => s.kind + (s.ref ? ' ' + s.ref : '') + (s.mode ? ' (' + s.mode + ')' : '')).join(' → '));
    out.push('');
  }
  out.push(...sceneLines(lesson), ...textLines(lesson));
  if (lesson.grammar) {
    out.push('## Грамматика', '');
    for (const [id, g] of Object.entries(lesson.grammar)) {
      out.push('### ' + id + ' · ' + ru(g.title), '', ru(g.body));
      if (g.line) out.push('Строка: ' + he(g.line.he) + ' — слоты: ' + g.line.slots.map(s => s.from + '–' + s.to + ' ' + ru(s.label)).join(', '));
      for (const p of g.pattern || []) out.push('Образец: ' + he(p));
      out.push('');
    }
  }
  out.push('## Задания', '');
  for (const task of lesson.tasks) out.push(...taskLines(task));
  if (lesson.skills) out.push('## Умения', '', ...lesson.skills.map(s => '- ' + ru(s.label) + ': ' + s.tasks.join(', ')), '');
  if (lesson.media) {
    out.push('## Места под медиа', '');
    for (const m of lesson.media) out.push('- **' + m.id + '** (' + (m.kind || 'image') + ', ' + (m.aspect || '') + ', у ' + m.target + '): ' + ru(m.purpose) + ' Бриф: ' + ru(m.brief) + ' Подпись: ' + ru(m.alt));
    out.push('');
  }
  return out.join('\n');
}
module.exports = { lessonToMarkdown };
if (require.main === module) {
  const fs = require('node:fs');
  process.stdout.write(lessonToMarkdown(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))) + '\n');
}
