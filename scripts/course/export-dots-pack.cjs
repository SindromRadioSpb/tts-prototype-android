'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { lessonToMarkdown } = require('./lesson-to-text.cjs');

const IMAGE_BYTES = 400 * 1024, MAX_SIDE = 1600;
const TEMPLATES = path.join(__dirname, 'dots-pack');

// The Hebrew line next to a slot gives dots the meaning it must not contradict.
function slotContext(lesson, target) {
  const turn = lesson.scene?.turns?.find(t => t.id === target);
  if (turn) return { he: turn.he.niqqud, ru: turn.ru.ru };
  const para = lesson.text?.paras?.find(p => p.id === target);
  if (para) return { he: para.he.niqqud, ru: para.ru.ru };
  const task = lesson.tasks.find(t => t.id === target);
  if (task) return { he: task.model?.niqqud || '', ru: task.prompt.ru };
  if (lesson.scene?.id === target) return { he: lesson.scene.turns[0]?.he.niqqud || '', ru: lesson.goal.ru };
  if (lesson.text?.id === target) return { he: lesson.text.paras[0]?.he.niqqud || '', ru: lesson.text.paras[0]?.ru.ru || '' };
  return { he: '', ru: '' };
}

function slotFiles(media) {
  if (media.kind === 'sequence' && Array.isArray(media.frames)) return media.frames;
  return media.src ? [media.src] : [];
}

function exportPack(courseSrc, lessonId, outDir, { now = Date.now } = {}) {
  const lesson = JSON.parse(fs.readFileSync(path.join(courseSrc, 'lessons', lessonId + '.json'), 'utf8'));
  const course = JSON.parse(fs.readFileSync(path.join(courseSrc, 'course.json'), 'utf8'));
  if (typeof outDir !== 'string' || !outDir.trim()) throw new Error('Не указана папка выгрузки');
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) throw new Error('Папка выгрузки не пуста: ' + outDir);
  for (const dir of ['review', 'media/examples', 'results']) fs.mkdirSync(path.join(outDir, dir), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATES, 'README.dots.ru.md'), path.join(outDir, 'README.dots.ru.md'));
  fs.copyFileSync(path.join(TEMPLATES, 'review-form.ru.md'), path.join(outDir, 'review/form.ru.md'));
  const courseStyle = path.join(courseSrc, 'media-style.ru.md');
  fs.copyFileSync(fs.existsSync(courseStyle) ? courseStyle : path.join(TEMPLATES, 'style.ru.md'), path.join(outDir, 'media/style.ru.md'));
  fs.writeFileSync(path.join(outDir, 'lesson.ru-he.md'), lessonToMarkdown(lesson) + '\n');
  fs.writeFileSync(path.join(outDir, 'lesson.json'), JSON.stringify(lesson, null, 2) + '\n');
  // Archivers drop empty folders; a note keeps results/ in the ZIP.
  fs.writeFileSync(path.join(outDir, 'results', 'README.txt'), 'Положите сюда результаты: <id>.webp и <id>.json для каждого места (см. README.dots.ru.md).\n');
  const characters = path.join(courseSrc, 'media', 'characters.png');
  if (fs.existsSync(characters)) fs.copyFileSync(characters, path.join(outDir, 'media/characters.png'));
  const slots = [];
  for (const m of lesson.media || []) {
    if (!m.kind) continue;
    const files = slotFiles(m);
    files.forEach((file, i) => {
      const from = path.join(courseSrc, 'media', file);
      if (!fs.existsSync(from)) return;
      const ext = path.extname(file);
      fs.copyFileSync(from, path.join(outDir, 'media/examples', m.id + (files.length > 1 ? '.' + (i + 1) : '') + ext));
    });
    slots.push({
      id: m.id, kind: m.kind, target: m.target, purpose: m.purpose, brief: m.brief, alt: m.alt, aspect: m.aspect,
      maxBytes: IMAGE_BYTES, maxSide: MAX_SIDE, ...(m.kind === 'sequence' ? { frames: { min: 2, max: 4 } } : {}),
      context: slotContext(lesson, m.target)
    });
  }
  const pack = { format: 'course-dots-pack-v1', courseId: course.id, lessonId, lessonVersion: lesson.version, exportedAt: new Date(now()).toISOString(), slots };
  fs.writeFileSync(path.join(outDir, 'media/pack.json'), JSON.stringify(pack, null, 2) + '\n');
  return pack;
}

module.exports = { exportPack, slotContext, IMAGE_BYTES, MAX_SIDE };
if (require.main === module) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--lesson'), out = args.indexOf('--out');
  if (!args[0] || at < 0 || out < 0) {
    console.error('Использование: node scripts/course/export-dots-pack.cjs <courseSrc> --lesson <id> --out <dir>');
    process.exitCode = 1;
  } else {
    const pack = exportPack(args[0], args[at + 1], args[out + 1]);
    console.log('Выгружено мест: ' + pack.slots.length + ' → ' + args[out + 1]);
  }
}
