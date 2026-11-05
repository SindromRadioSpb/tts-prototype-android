'use strict';
// Renders a lesson's code-drawn illustrations to webp (via Chromium canvas), stores them content-hashed
// in <courseSrc>/media/, and fills src/frames of the lesson's media slots. Usage:
//   node scripts/course/render-illustrations.cjs <courseSrc> --lesson <id> [--preview <dir>]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { IMAGE_BYTES } = require('./export-dots-pack.cjs');

const DRAWINGS = { 'L001-cafe': () => require('./illustrations/cafe.cjs').drawings };

async function renderAll(courseSrc, lessonId, { preview } = {}) {
  const { chromium } = require('playwright');
  const lessonFile = path.join(courseSrc, 'lessons', lessonId + '.json');
  const lesson = JSON.parse(fs.readFileSync(lessonFile, 'utf8'));
  const drawings = DRAWINGS[lessonId]();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const encode = async ({ svg, width, height }) => {
    // Canvas webp keeps grain-textured art far below the PNG size of the same picture.
    const b64 = await page.evaluate(async ({ svg, width, height }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      await img.decode();
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      for (const q of [0.9, 0.82, 0.74, 0.66]) {
        const url = c.toDataURL('image/webp', q);
        if (url.length * 0.75 < 390 * 1024) return url.split(',')[1];
      }
      return c.toDataURL('image/webp', 0.6).split(',')[1];
    }, { svg, width, height });
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > IMAGE_BYTES) throw new Error('Иллюстрация больше 400 КБ');
    if (/[֐-׿]|<text/.test(svg)) throw new Error('В рисунке есть текст');
    return buf;
  };
  const out = path.join(courseSrc, 'media');
  fs.mkdirSync(out, { recursive: true });
  const save = buf => {
    const name = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) + '.webp';
    const file = path.join(out, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
    return name;
  };
  const report = [];
  try {
    for (const m of lesson.media || []) {
      const draw = drawings[m.id];
      if (!draw) continue;
      const result = draw();
      if (result.frames) {
        const bufs = [];
        for (const f of result.frames) bufs.push(await encode(f));
        m.frames = bufs.map(save); delete m.src;
        report.push({ id: m.id, files: m.frames, bytes: bufs.map(b => b.length) });
        if (preview) bufs.forEach((b, i) => fs.writeFileSync(path.join(preview, m.id + '.' + (i + 1) + '.webp'), b));
      } else {
        const buf = await encode(result);
        m.src = save(buf); delete m.frames;
        report.push({ id: m.id, files: [m.src], bytes: [buf.length] });
        if (preview) fs.writeFileSync(path.join(preview, m.id + '.webp'), buf);
      }
      m.credits = { ru: 'Claude, код-рисунок в стиле A' };
    }
  } finally { await browser.close(); }
  fs.writeFileSync(lessonFile, JSON.stringify(lesson, null, 2) + '\n');
  return report;
}

module.exports = { renderAll };
if (require.main === module) {
  const args = process.argv.slice(2);
  const li = args.indexOf('--lesson'), pi = args.indexOf('--preview');
  if (!args[0] || li < 0) { console.error('Использование: node scripts/course/render-illustrations.cjs <courseSrc> --lesson <id> [--preview <dir>]'); process.exitCode = 1; }
  else {
    const preview = pi >= 0 ? args[pi + 1] : null;
    if (preview) fs.mkdirSync(preview, { recursive: true });
    renderAll(args[0], args[li + 1], { preview }).then(r => {
      for (const x of r) console.log(x.id.padEnd(16), x.files.join(', '), x.bytes.map(b => Math.round(b / 1024) + ' КБ').join(', '));
    }).catch(e => { console.error(e.message); process.exitCode = 1; });
  }
}
