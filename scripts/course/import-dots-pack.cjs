'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EXT_KIND = { png: 'png', webp: 'webp', jpg: 'jpeg', jpeg: 'jpeg' };

// Format and pixel size from the file header, never from the file name.
function inspect(buf) {
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') return { format: 'webp', width: 1 + (((buf[22] & 0x3f) << 8) | buf[21]), height: 1 + (((buf[24] & 0x0f) << 10) | (buf[23] << 2) | ((buf[22] & 0xc0) >> 6)) };
    if (chunk === 'VP8X') return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    return { format: 'webp', width: 0, height: 0 };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: 'jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return { format: 'jpeg', width: 0, height: 0 };
  }
  return { format: null, width: 0, height: 0 };
}

function resultFiles(dir, slot) {
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const esc = slot.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (slot.kind === 'sequence') {
    return names.map(n => n.match(new RegExp('^' + esc + '\\.(\\d+)\\.(png|webp|jpe?g)$', 'i'))).filter(Boolean)
      .sort((a, b) => Number(a[1]) - Number(b[1])).map(m => m[0]);
  }
  return names.filter(n => new RegExp('^' + esc + '\\.(png|webp|jpe?g)$', 'i').test(n));
}

function checkSlot(packDir, slot) {
  const dir = path.join(packDir, 'results');
  const files = resultFiles(dir, slot);
  if (!files.length) return { missing: true };
  const metaPath = path.join(dir, slot.id + '.json');
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) { return { reason: 'нет описания ' + slot.id + '.json' }; }
  if (meta.containsText !== false) return { reason: 'не подтверждено отсутствие текста на картинке (containsText должно быть false)' };
  if (!meta.alt || typeof meta.alt.ru !== 'string' || !meta.alt.ru.trim()) return { reason: 'нет подписи alt.ru' };
  if (slot.kind === 'sequence' && (files.length < 2 || files.length > 4)) return { reason: 'анимации нужно 2–4 кадра, а пришло ' + files.length };
  if (slot.kind !== 'sequence' && files.length > 1) return { reason: 'для картинки пришло несколько файлов' };
  const out = [];
  for (const name of files) {
    const buf = fs.readFileSync(path.join(dir, name));
    const ext = name.split('.').pop().toLowerCase();
    const info = inspect(buf);
    if (!info.format || info.format !== EXT_KIND[ext]) return { reason: name + ': формат не совпадает с содержимым' };
    if (buf.length > slot.maxBytes) return { reason: name + ': файл больше ' + Math.round(slot.maxBytes / 1024) + ' КБ' };
    if (Math.max(info.width, info.height) > slot.maxSide) return { reason: name + ': длинная сторона больше ' + slot.maxSide + ' px' };
    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    out.push({ buf, file: hash + '.' + (info.format === 'jpeg' ? 'jpg' : info.format) });
  }
  return { files: out, meta };
}

const currentFiles = m => m.kind === 'sequence' && Array.isArray(m.frames) ? m.frames : m.src ? [m.src] : [];

function importPack(packDir, courseSrc, { dryRun = false, choice = {} } = {}) {
  const pack = JSON.parse(fs.readFileSync(path.join(packDir, 'media/pack.json'), 'utf8'));
  if (pack.format !== 'course-dots-pack-v1') throw new Error('Неизвестный формат пакета');
  const lessonFile = path.join(courseSrc, 'lessons', pack.lessonId + '.json');
  const lesson = JSON.parse(fs.readFileSync(lessonFile, 'utf8'));
  const res = { accepted: [], rejected: [], skipped: [], missing: [], review: [] };
  let changed = false;
  for (const slot of pack.slots) {
    const media = (lesson.media || []).find(m => m.id === slot.id);
    // A changed lesson keeps only slots whose identity and placement did not move.
    if (!media || media.kind !== slot.kind || media.target !== slot.target) { res.skipped.push(slot.id); continue; }
    const check = checkSlot(packDir, slot);
    if (check.missing) { res.missing.push(slot.id); continue; }
    if (check.reason) { res.rejected.push({ id: slot.id, reason: check.reason }); continue; }
    res.accepted.push(slot.id);
    const claude = currentFiles(media);
    res.review.push({ slot, claude, dots: check.files.map(f => f.file), dotsBuf: check.files.map(f => f.buf), meta: check.meta });
    if (dryRun) continue;
    fs.mkdirSync(path.join(courseSrc, 'media'), { recursive: true });
    for (const f of check.files) {
      const target = path.join(courseSrc, 'media', f.file);
      if (!fs.existsSync(target)) fs.writeFileSync(target, f.buf, { flag: 'wx' });
    }
    const useDots = claude.length === 0 ? choice[slot.id] !== 'claude' : choice[slot.id] === 'dots';
    if (useDots) {
      if (slot.kind === 'sequence') { media.frames = check.files.map(f => f.file); delete media.src; }
      else media.src = check.files[0].file;
      media.alt = { ru: check.meta.alt.ru };
      if (check.meta.credits?.ru) media.credits = { ru: check.meta.credits.ru };
      changed = true;
    }
  }
  if (!dryRun) {
    if (changed) fs.writeFileSync(lessonFile, JSON.stringify(lesson, null, 2) + '\n');
    fs.writeFileSync(path.join(packDir, 'review.html'), reviewHtml(pack, res, courseSrc));
  }
  for (const r of res.review) delete r.dotsBuf;
  return res;
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function dataUri(buf, file) {
  const ext = file.split('.').pop();
  return 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + buf.toString('base64');
}
// Side-by-side sheet: the owner looks at both versions and picks one per slot.
function reviewHtml(pack, res, courseSrc) {
  const cards = res.review.map(r => {
    const claude = r.claude.map(f => {
      const p = path.join(courseSrc, 'media', f);
      return fs.existsSync(p) ? '<figure><img alt="" src="' + dataUri(fs.readFileSync(p), f) + '"><figcaption>' + esc(f) + '</figcaption></figure>' : '<p>' + esc(f) + ' (файла нет)</p>';
    }).join('') || '<p>Версии Claude нет</p>';
    const dots = r.dots.map((f, i) => '<figure><img alt="" src="' + dataUri(r.dotsBuf[i], f) + '"><figcaption>' + esc(f) + '</figcaption></figure>').join('');
    return '<section><h2>' + esc(r.slot.id) + '</h2><p><b>Зачем:</b> ' + esc(r.slot.purpose?.ru) + '</p><p><b>Бриф:</b> ' + esc(r.slot.brief?.ru) + '</p>' +
      '<p dir="rtl" lang="he" class="he">' + esc(r.slot.context?.he) + '</p><p>' + esc(r.slot.context?.ru) + '</p>' +
      '<div class="pair"><div><h3>Claude</h3>' + claude + '<label><input type="radio" name="c-' + esc(r.slot.id) + '" value="claude" data-choice="' + esc(r.slot.id) + '"' + (r.claude.length ? ' checked' : '') + '> выбрать</label></div>' +
      '<div><h3>dots</h3>' + dots + '<p>Подпись: ' + esc(r.meta.alt.ru) + '</p><label><input type="radio" name="c-' + esc(r.slot.id) + '" value="dots" data-choice="' + esc(r.slot.id) + '"' + (r.claude.length ? '' : ' checked') + '> выбрать</label></div></div></section>';
  }).join('\n');
  const rejected = res.rejected.map(x => '<li>' + esc(x.id) + ': ' + esc(x.reason) + '</li>').join('');
  return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Выбор картинок · ' + esc(pack.lessonId) + '</title>' +
    '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:16px;background:#f4f6f9;color:#0f172a}section{background:#fff;border-radius:14px;padding:16px;margin:16px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:700px){.pair{grid-template-columns:1fr}}img{max-width:100%;border-radius:12px;background:#f6f2ea}.he{font-size:1.3rem}textarea{width:100%;min-height:90px;font:14px monospace}</style>' +
    '<h1>Картинки урока ' + esc(pack.lessonId) + '</h1><p>Выберите версию для каждого места. Скопируйте выбор из поля внизу и передайте Claude.</p>' +
    (rejected ? '<h2>Не принято</h2><ul>' + rejected + '</ul>' : '') + cards +
    '<h2>Выбор</h2><textarea id="choice" readonly></textarea>' +
    '<script>function upd(){const o={};document.querySelectorAll("input[data-choice]:checked").forEach(i=>o[i.dataset.choice]=i.value);document.getElementById("choice").value=JSON.stringify(o);}document.addEventListener("change",upd);upd();</script></html>';
}

module.exports = { importPack, inspect };
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const ci = args.indexOf('--choice');
  const choice = ci >= 0 ? JSON.parse(fs.readFileSync(args[ci + 1], 'utf8')) : {};
  const [packDir, courseSrc] = args.filter((a, i) => !a.startsWith('--') && (ci < 0 || i !== ci + 1));
  if (!packDir || !courseSrc) { console.error('Использование: node scripts/course/import-dots-pack.cjs <packDir> <courseSrc> [--dry-run] [--choice choice.json]'); process.exitCode = 1; }
  else {
    const r = importPack(packDir, courseSrc, { dryRun, choice });
    console.log('Принято: ' + (r.accepted.join(', ') || '—'));
    for (const x of r.rejected) console.log('Отклонено ' + x.id + ': ' + x.reason);
    if (r.skipped.length) console.log('Пропущено (урок изменился): ' + r.skipped.join(', '));
    if (r.missing.length) console.log('Без ответа: ' + r.missing.join(', '));
    if (!dryRun) console.log('Лист выбора: ' + path.join(packDir, 'review.html'));
  }
}
