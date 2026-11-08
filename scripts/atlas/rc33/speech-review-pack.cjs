#!/usr/bin/env node
// Owner listening/reading pack for the 97001 RC3.3 speaker text: every row changed by a rule, a sample of formulas,
// and the lexicon additions. Text only; no recordings are made.
//   node scripts/atlas/rc33/speech-review-pack.cjs --out <file.md> [--data .tmp/rc33/candidate]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const T = require('../atlas-tts.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DATA = path.resolve(args.data || path.join(ROOT, '.tmp', 'rc33', 'candidate'));
T.selectAtlas('a97001rc32');
const lex = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas/a97001rc32/speech-lexicon.json'), 'utf8'));
const ov = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas/a97001rc32/speech-overrides.json'), 'utf8'));
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const short = (id) => id.replace(/^a97001rc32:/, '');

const byId = new Map(), formulas = [];
for (const f of fs.readdirSync(path.join(DATA, 'sections')).filter((x) => x.endsWith('.json')).sort()) {
  for (const it of T.sectionPlan(DATA, f.slice(0, -5), lex, ov).items) {
    byId.set(it.id, it);
    if (it.kind === 'formula' && it.ok && !ov.items[it.id]) formulas.push(it);
  }
}
const titles = {
  'line-fix': 'Строки с косой чертой и особыми знаками', abbreviation: 'Сокращения', 'slash-alternative': 'Альтернативы через «/»',
  'crossed-out-root': 'Отброшенные корни (в книге зачёркнуты)', 'product-key': 'Коды изделий (стр. 197)', 'alloy-code': 'Марки сплавов (стр. 200)',
  'manual-text': 'Заданный вручную текст', 'plain-formula': 'Формулы без LaTeX (читаются как обозначения)',
};
const out = ['# Атлас 97001 RC3.3 — текст для диктора: что прослушать', '',
  'Голос — he-IL-Standard-A, скорость 0.8 (как в 97002). Записей пока нет: это текст, который будет отправлен голосу.',
  'Учебные строки книги не меняются; этот слой — только для диктора (`atlas/a97001rc32/speech-overrides.json`).',
  'Ошибку в строке поправить в `scripts/atlas/rc33/speech-prep.cjs` (таблицы ABBR/LINE/TEXT) и перезапустить; ошибку словаря — в `atlas/a97001rc32/speech-lexicon.json`.', ''];
for (const [rule, title] of Object.entries(titles)) {
  const rows = Object.entries(ov.items).filter(([, v]) => v.rule === rule);
  if (!rows.length) continue;
  out.push('## ' + title + ' (' + rows.length + ')', '', '| Место | В книге | Скажет диктор |', '|---|---|---|');
  const shown = rule === 'plain-formula' ? rows.slice(0, 25) : rows;
  for (const [id, v] of shown) {
    const it = byId.get(id) || {};
    out.push('| ' + short(id) + ' | ' + cell(it.he || it.latex || '') + ' | ' + cell(v.text) + ' |');
  }
  if (shown.length < rows.length) out.push('', '…и ещё ' + (rows.length - shown.length) + ' — полный список в speech-overrides.json.');
  out.push('');
}
out.push('## Формулы из LaTeX — выборка (30 из ' + formulas.length + ')', '', '| Место | LaTeX | Скажет диктор |', '|---|---|---|');
const step = Math.max(1, Math.floor(formulas.length / 30));
for (let i = 0; i < formulas.length && i / step < 30; i += step) out.push('| ' + short(formulas[i].id) + ' | `' + cell(formulas[i].latex) + '` | ' + cell(formulas[i].text) + ' |');
out.push('', '## Не озвучивается', '', '| Причина | Строк |', '|---|---|');
const reasons = {};
for (const v of Object.values(ov.items)) if (v.exclude) reasons[v.reason] = (reasons[v.reason] || 0) + 1;
for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) out.push('| ' + r + ' | ' + n + ' |');
out.push('', '## Дополнения словаря 97001', '', '| Обозначение | Скажет диктор |', '|---|---|');
for (const k of lex.review.additions_97001 || []) out.push('| ' + k + ' | ' + lex.units[k] + ' |');
out.push('', 'Известное: после числа 1 единица звучит во множественном числе («1 שְׁנִיּוֹת»), как и в 97002 («1 דַּקּוֹת»).', '');
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(path.resolve(args.out), out.join('\n'));
console.log(JSON.stringify({ out: args.out, overrides: Object.keys(ov.items).length, latex_formulas: formulas.length }));
