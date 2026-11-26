'use strict';
// The instruction for dot on the site (2026-11-22): the same dotTask.md that goes into every
// edition archive as README-dot.md, at one stable address. The version is a hash of the text,
// so any edit reaches dot through `task.version` in the answers it already reads.
// News sources W6 (spec 2026-11-26 §9): the text ends with the outlet catalog made from the code
// (public/js/news-outlets.js), so a new outlet reaches dot with a new version, never by hand.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Outlets = require('../public/js/news-outlets');

const TASK_URL = '/api/news/dot-task.md';
const FILE = path.join(__dirname, 'harvest', 'dotTask.md');
const GROUP_RU = { national: 'Национальные', local: 'Местные', religious: 'Религиозные', haredi: 'Харедимные', economy_tech: 'Экономика и технологии',
  science_env: 'Наука и экология', society: 'Общество и расследования', radio: 'Радио' };
const REGION_RU = { north: 'север', jerusalem: 'Иерусалим', center: 'центр', south: 'юг' };

function catalogSection() {
  const lines = ['', '## Издания каталога', '',
    'Список из кода сайта (`public/js/news-outlets.js`). Какие из них сейчас в срезе, решает владелец галочками; в выпуск попадают только статьи изданий среза. `outlet_id` статьи — первое поле строки.', ''];
  const keyOf = o => o.group === 'local' && o.region ? 'local:' + o.region : o.group;
  const order = [];
  Outlets.GROUPS.forEach(g => { if (g === 'local') Outlets.REGIONS.forEach(r => order.push('local:' + r)); order.push(g); });
  for (const key of order) {
    const list = Outlets.OUTLETS.filter(o => keyOf(o) === key);
    if (!list.length) continue;
    const [g, r] = key.split(':');
    lines.push('**' + GROUP_RU[g] + (r ? ': ' + REGION_RU[r] : '') + '**');
    for (const o of list) lines.push('- `' + o.id + '` — ' + o.name_he + ' · ' + o.name_latin + ' · ' + o.domains.join(', '));
    lines.push('');
  }
  return lines.join('\n');
}

function createDotTask({ read = () => fs.readFileSync(FILE, 'utf8') } = {}) {
  let cached = null;
  function get() {
    if (cached) return cached;
    const text = String(read()).replace(/\s*$/, '\n') + catalogSection();
    const m = /Обновлено:\s*(\d{4}-\d{2}-\d{2})/.exec(text);
    cached = { text, version: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12), updated: m ? m[1] : null, url: TASK_URL };
    return cached;
  }
  // What dot needs in an answer: enough to know whether to re-read the text.
  const meta = () => { const t = get(); return { version: t.version, updated: t.updated, url: t.url }; };
  return { get, meta };
}

module.exports = { createDotTask, TASK_URL, catalogSection };
