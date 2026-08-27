#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKET = path.join(ROOT, 'docs', 'research', 'physics-learning-derivatives', '2026-08-27');
const CORPUS_PATH = path.join(ROOT, 'docs', 'research', 'physics-corpus', '2026-08-24', 'physics-year1-corpus-records.json');
const ANSWER_PATH = path.join(PACKET, 'answer-ledger.json');
const SOLUTION_PATH = path.join(PACKET, 'solution-ledger.json');
const SOLUTION_RU_PATH = path.join(PACKET, 'solution-ledger.ru.json');
const OUT = path.join(PACKET, 'artifacts');
const TASKS_OUT = path.join(OUT, 'tasks');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function indexByTask(entries, label) {
  const result = new Map();
  for (const entry of entries) {
    assert(entry && /^\d+\.\d+$/.test(entry.task_number), `${label}: invalid task number`);
    assert(!result.has(entry.task_number), `${label}: duplicate ${entry.task_number}`);
    result.set(entry.task_number, entry);
  }
  return result;
}

function compareTaskSets(corpusTasks, answerMap, solutionMap) {
  const canonical = corpusTasks.map((task) => task.task_number);
  assert(canonical.length === 74, `Expected 74 corpus tasks, got ${canonical.length}`);
  for (const [label, map] of [['answer', answerMap], ['solution', solutionMap]]) {
    assert(map.size === 74, `Expected 74 ${label} entries, got ${map.size}`);
    const missing = canonical.filter((taskNumber) => !map.has(taskNumber));
    const extra = [...map.keys()].filter((taskNumber) => !canonical.includes(taskNumber));
    assert(missing.length === 0, `${label}: missing ${missing.join(', ')}`);
    assert(extra.length === 0, `${label}: extra ${extra.join(', ')}`);
  }
}

function answerText(answer) {
  return answer.parts.map((part) => `${part.label ? `${part.label}. ` : ''}${part.text}`).join(' | ');
}

function comparisonLabel(value) {
  return ({
    EXACT: 'Точное совпадение',
    WITHIN_TOLERANCE: 'Совпадает с учётом округления',
    MISMATCH: 'Расхождение с ключом',
    SOURCE_INSUFFICIENT: 'Недостаточно данных в источнике'
  })[value] || value;
}

function conditionRows(task, field) {
  return task.rows.map((row) => row[field]).filter(Boolean);
}

function markdownForTask(task, answer, solution) {
  const ru = conditionRows(task, 'ru').map((text) => `- ${text}`).join('\n');
  const he = conditionRows(task, 'he_plain').map((text) => `- ${text}`).join('\n');
  const steps = solution.derivation.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const warning = solution.comparison === 'MISMATCH'
    ? `\n> Важно: **расхождение с ключом**. ${solution.comparison_note}\n`
    : '';
  return `---
schema: physics_task_learning_derivative.1.0.0
corpus: physics-year1-problems
task_number: "${task.task_number}"
source_page: ${task.source_page}
source_image_sha256: ${task.source_image_sha256}
review_state: ANSWER_COMPARED
comparison: ${solution.comparison}
---

# Физика — задача ${task.task_number}

## Условие на русском

${ru}

## Оригинал на иврите

<div dir="rtl">

${he}

</div>

## Попробуйте сами

Сначала зафиксируйте известные величины, систему отсчёта и искомые значения. Ответ и решение ниже отделены, чтобы их можно было не читать до собственной попытки.

## Подсказка: модель

${solution.model}

## Независимое решение

${steps}

**Результат:** ${solution.result}

## Сверка с ответами

- Ключ: ${answerText(answer)}
- Вердикт: **${solution.comparison}**
${warning}
## Происхождение и границы

- Каноническая страница корпуса: ${task.source_page}
- SHA-256 печатного исходного изображения: \`${task.source_image_sha256}\`
- Ответы вручную перенесены из растрового ключа и использованы только после независимого вывода.
- Рукописные решения не распознавались, не переписывались и не использовались.
- Публичная публикация этой производной пока не разрешена.
`;
}

function agentGuide(taskDocuments) {
  return `---
schema: physics_agent_learning_guide.1.0.0
corpus: physics-year1-problems
task_count: 74
locale: ru
handwritten_solution_used: false
publication_status: LOCAL_REVIEW_ONLY
---

# Физика — задачник, 1 год: независимые решения

Этот файл предназначен для поиска и работы агента. Каждая секция содержит
каноническое условие, физическую модель, независимый вывод, краткий ответ,
сверку с ключом и происхождение. Ответы из ключа открывались только после
вывода; рукописные решения не распознавались и не использовались.

${taskDocuments.join('\n\n---\n\n')}`;
}

function renderTaskCard(task, answer, solution) {
  const mismatch = solution.comparison === 'MISMATCH';
  const ru = conditionRows(task, 'ru').map((text) => `<p>${escapeHtml(text)}</p>`).join('');
  const he = conditionRows(task, 'he_plain').map((text) => `<p>${escapeHtml(text)}</p>`).join('');
  const steps = solution.derivation.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  const answerParts = answer.parts.map((part) => `<li><b>${escapeHtml(part.label || '—')}</b> ${escapeHtml(part.text)}</li>`).join('');
  return `<article class="task ${mismatch ? 'task--mismatch' : ''}" id="task-${task.task_number}" data-task="${task.task_number}" data-search="${escapeHtml(`${task.task_number} ${conditionRows(task, 'ru').join(' ')}`.toLowerCase())}">
    <header class="task__header">
      <div><span class="eyebrow">Задача ${task.task_number}</span><h2>Физическая модель и проверка</h2></div>
      <span class="verdict verdict--${mismatch ? 'warn' : 'ok'}">${mismatch ? 'Проверить расхождение' : 'Сверено'}</span>
    </header>
    <div class="evidence-rail" aria-label="Этапы проверки"><span>условие</span><i></i><span>модель</span><i></i><span>вывод</span><i></i><span>ответ</span><i></i><span>сверка</span></div>
    <section class="condition"><h3>Условие</h3>${ru}</section>
    <details class="hebrew"><summary>Оригинал на иврите</summary><div dir="rtl" lang="he">${he}</div></details>
    <div class="attempt"><b>Пауза перед решением</b><span>Выпишите данные, выберите оси и попробуйте получить формулу самостоятельно.</span></div>
    <details class="hint"><summary>Подсказка: физическая модель</summary><p>${escapeHtml(solution.model)}</p></details>
    <details class="solution"><summary>Показать независимое решение</summary><ol>${steps}</ol><p class="result"><span>Итог</span>${escapeHtml(solution.result)}</p></details>
    <details class="answer"><summary>Показать ответ и сверку</summary><ul>${answerParts}</ul><p class="comparison ${mismatch ? 'comparison--warn' : ''}">${escapeHtml(comparisonLabel(solution.comparison))}</p>${mismatch ? `<p>${escapeHtml(solution.comparison_note)}</p>` : ''}</details>
    <footer><span>Источник: страница ${task.source_page}</span><code title="SHA-256 исходного изображения">${task.source_image_sha256.slice(0, 12)}…</code></footer>
  </article>`;
}

function renderHtml(corpusTasks, answerMap, solutionMap) {
  const mismatchCount = corpusTasks.filter((task) => solutionMap.get(task.task_number).comparison === 'MISMATCH').length;
  const chapters = [...new Set(corpusTasks.map((task) => task.chapter))];
  const chapterNav = chapters.map((chapter) => `<a href="#chapter-${chapter}">0${chapter}</a>`).join('');
  const sections = chapters.map((chapter) => {
    const tasks = corpusTasks.filter((task) => task.chapter === chapter);
    const chapterHeading = tasks.find((task) => task.chapter_heading)?.chapter_heading?.ru || `Глава ${chapter}`;
    return `<section class="chapter" id="chapter-${chapter}"><header class="chapter__header"><span>Глава 0${chapter}</span><h1>${escapeHtml(chapterHeading.replace(/^Глава \d+:\s*/, ''))}</h1><b>${tasks.length} задач</b></header>${tasks.map((task) => renderTaskCard(task, answerMap.get(task.task_number), solutionMap.get(task.task_number))).join('\n')}</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Физика — 74 проверенных решения</title>
<style>
:root{--ink:#182128;--paper:#f2efe7;--panel:#fffdf7;--blue:#155d83;--blue2:#0b3954;--amber:#d89022;--red:#a43b32;--line:#c8c4b8;--muted:#66727a;--shadow:0 18px 48px #102b3a18}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--paper);font:16px/1.6 "Segoe UI",Arial,sans-serif;background-image:linear-gradient(#155d8309 1px,transparent 1px),linear-gradient(90deg,#155d8309 1px,transparent 1px);background-size:24px 24px}a{color:inherit}.masthead{padding:64px max(24px,calc((100vw - 1120px)/2));background:var(--blue2);color:#fff;position:relative;overflow:hidden}.masthead:after{content:"";position:absolute;inset:auto -8% -160px 42%;height:320px;border:48px solid #ffffff0c;border-radius:50%;transform:rotate(-14deg)}.kicker,.eyebrow{text-transform:uppercase;letter-spacing:.15em;font-weight:800;font-size:.72rem}.masthead h1{font:700 clamp(2.4rem,7vw,5.8rem)/.95 Georgia,serif;max-width:900px;margin:.3em 0}.masthead p{max-width:720px;color:#dbeaf1}.stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.stats span{border:1px solid #ffffff33;padding:8px 12px;border-radius:999px}.toolbar{position:sticky;top:0;z-index:9;background:#f2efe7ee;backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:10px max(16px,calc((100vw - 1120px)/2));display:flex;gap:12px;align-items:center}.toolbar nav{display:flex;gap:6px;overflow:auto}.toolbar a{min-width:38px;text-align:center;text-decoration:none;padding:7px;border:1px solid var(--line);border-radius:4px;background:#fff}.toolbar input{margin-left:auto;min-width:250px;padding:10px 12px;border:1px solid var(--line);background:white;border-radius:4px}.content{max-width:1120px;margin:auto;padding:36px 24px 100px}.chapter{scroll-margin-top:76px}.chapter__header{display:grid;grid-template-columns:110px 1fr auto;align-items:end;gap:20px;margin:60px 0 20px;border-bottom:4px solid var(--blue2)}.chapter__header span,.chapter__header b{padding-bottom:12px;color:var(--blue)}.chapter__header h1{margin:0;font:700 clamp(1.7rem,4vw,3rem)/1.05 Georgia,serif;padding-bottom:10px}.task{scroll-margin-top:76px;background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--blue);padding:28px;margin:18px 0;box-shadow:var(--shadow)}.task--mismatch{border-left-color:var(--red)}.task__header{display:flex;justify-content:space-between;gap:24px;align-items:start}.task__header h2{font:700 1.35rem/1.2 Georgia,serif;margin:.3rem 0 0}.verdict{font-size:.75rem;font-weight:800;padding:6px 10px;border-radius:3px;background:#e4f1e8;color:#24633a;white-space:nowrap}.verdict--warn{background:#f7e4df;color:#8b2f28}.evidence-rail{display:flex;align-items:center;gap:8px;color:var(--blue);font-size:.72rem;font-weight:800;margin:22px 0;text-transform:uppercase;letter-spacing:.08em}.evidence-rail i{height:1px;min-width:12px;flex:1;background:var(--amber)}h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.12em;color:var(--blue);margin-top:24px}.condition p{margin:.7em 0}.attempt{display:flex;gap:16px;border:1px dashed var(--amber);padding:14px;margin:20px 0;background:#fff8e8}.attempt span{color:var(--muted)}details{border-top:1px solid var(--line);padding:12px 0}summary{cursor:pointer;font-weight:750;color:var(--blue2)}details p,details ol,details ul{margin-left:18px;margin-right:18px}.hebrew div{font-size:1.1rem}.result{border-left:3px solid var(--amber);padding:12px;background:#fff8e8}.result span{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:.68rem;font-weight:800;color:#8c5b11}.comparison{display:inline-block;background:#e4f1e8;color:#24633a;padding:4px 8px;font-weight:800}.comparison--warn{background:#f7e4df;color:#8b2f28}.task footer{display:flex;justify-content:space-between;color:var(--muted);font-size:.75rem;margin-top:20px}code{font-family:Consolas,monospace}.no-results{display:none;padding:50px;text-align:center;color:var(--muted)}@media(max-width:700px){.masthead{padding:44px 20px}.toolbar{align-items:stretch;flex-direction:column}.toolbar input{margin:0;min-width:0;width:100%}.content{padding:18px 12px 70px}.chapter__header{grid-template-columns:1fr auto}.chapter__header h1{grid-column:1/-1}.task{padding:20px 16px}.task__header{display:block}.verdict{display:inline-block;margin-top:12px}.evidence-rail{overflow:auto}.attempt{display:block}.task footer{display:block}.task footer code{display:block;margin-top:6px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{.toolbar,.attempt{display:none}.masthead{background:#fff;color:#000;padding:20px}.masthead p{color:#333}.content{max-width:none;padding:0}.task{break-inside:avoid;box-shadow:none}.solution[open],.answer[open]{display:block}details{display:block}details>summary{font-weight:bold}}
</style><style>@media print{details>*:not(summary){display:block!important}}</style></head><body>
<header class="masthead"><span class="kicker">LinguistPro · инженерная физика</span><h1>74 задачи.<br>Решение прежде ответа.</h1><p>Независимые выводы из печатных условий и схем. Ключ использован только для контрольной сверки; рукописные решения не распознавались и не использовались.</p><div class="stats"><span>74 задачи</span><span>9 глав</span><span>${mismatchCount} расхождений</span><span>локальный R1</span></div></header>
<div class="toolbar"><nav aria-label="Главы">${chapterNav}</nav><input id="search" type="search" placeholder="Номер или слова из условия" aria-label="Поиск по задачам"></div>
<main class="content">${sections}<p class="no-results" id="no-results">Совпадений не найдено.</p></main>
<script>const q=document.querySelector('#search'),cards=[...document.querySelectorAll('.task')],empty=document.querySelector('#no-results');q.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();let n=0;for(const c of cards){const show=!s||c.dataset.search.includes(s);c.hidden=!show;if(show)n++}for(const ch of document.querySelectorAll('.chapter'))ch.hidden=![...ch.querySelectorAll('.task')].some(c=>!c.hidden);empty.style.display=n?'none':'block'});</script>
</body></html>`;
}

function buildReviewReport(corpusTasks, solutionMap) {
  const mismatches = corpusTasks.filter((task) => solutionMap.get(task.task_number).comparison === 'MISMATCH');
  const rows = mismatches.map((task) => {
    const solution = solutionMap.get(task.task_number);
    return `| ${task.task_number} | ${solution.result.replaceAll('|', '\\|')} | ${solution.comparison_note.replaceAll('|', '\\|')} |`;
  }).join('\n');
  return `# Physics answer comparison report

Date: 2026-08-27
Scope: 74/74 tasks
Method: independent derivation first; answer-key comparison second
Handwritten solution use: none

## Outcome

- 74 unique task records match the canonical corpus set.
- ${74 - mismatches.length} tasks agree with the key within the declared rounding tolerance.
- ${mismatches.length} tasks have a material mismatch or source contradiction.
- A mismatch is never repaired by widening tolerance.

## Mismatches requiring owner review

| Task | Independent result | Finding |
|---|---|---|
${rows}

## Publication gate

This local derivative is not approved for production. Resolve or deliberately annotate every mismatch, complete an owner second pass over the answer transcription, and provide the rights/publication attestation described in the R1 plan.
`;
}

function main() {
  const corpus = readJson(CORPUS_PATH);
  const answerLedger = readJson(ANSWER_PATH);
  const solutionLedger = readJson(SOLUTION_PATH);
  const solutionRuLedger = readJson(SOLUTION_RU_PATH);
  const answerMap = indexByTask(answerLedger.entries, 'answer ledger');
  const sourceSolutionMap = indexByTask(solutionLedger.entries, 'solution ledger');
  const solutionRuMap = indexByTask(solutionRuLedger.entries, 'Russian solution localization');
  compareTaskSets(corpus.tasks, answerMap, sourceSolutionMap);
  compareTaskSets(corpus.tasks, answerMap, solutionRuMap);
  const solutionMap = new Map(corpus.tasks.map((task) => {
    const source = sourceSolutionMap.get(task.task_number);
    const localized = solutionRuMap.get(task.task_number);
    return [task.task_number, { ...source, ...localized, comparison: source.comparison }];
  }));
  assert(answerLedger.source.sha256 === '5c5823f556ad4e7e892977bfbe6a0d86ef0b5b6bf241f58b5fb9d857905b84d9', 'Unexpected answer-key hash');
  assert(solutionLedger.review.handwritten_solution_used === false, 'Handwritten solution use must remain false');

  fs.mkdirSync(TASKS_OUT, { recursive: true });
  const generatedFiles = [];
  const taskDocuments = [];
  for (const task of corpus.tasks) {
    const relative = path.join('tasks', `task-${task.task_number}.md`);
    const body = markdownForTask(task, answerMap.get(task.task_number), solutionMap.get(task.task_number));
    fs.writeFileSync(path.join(OUT, relative), body, 'utf8');
    taskDocuments.push(body);
    generatedFiles.push(relative.replaceAll('\\', '/'));
  }
  fs.writeFileSync(path.join(OUT, 'physics-year1-agent-guide.md'), agentGuide(taskDocuments), 'utf8');
  fs.writeFileSync(path.join(OUT, 'physics-year1-solutions.html'), renderHtml(corpus.tasks, answerMap, solutionMap), 'utf8');
  fs.writeFileSync(path.join(OUT, 'answer-comparison-report.md'), buildReviewReport(corpus.tasks, solutionMap), 'utf8');
  generatedFiles.push('physics-year1-agent-guide.md', 'physics-year1-solutions.html', 'answer-comparison-report.md');

  const manifest = {
    schema_version: 'physics_learning_derivative_manifest.1.0.0',
    corpus_slug: 'physics-year1-problems',
    generated_for_date: '2026-08-27',
    generator: 'scripts/premium/build-physics-learning-derivatives.js',
    task_count: corpus.tasks.length,
    mismatch_count: corpus.tasks.filter((task) => solutionMap.get(task.task_number).comparison === 'MISMATCH').length,
    handwritten_solution_used: false,
    files: generatedFiles.sort().map((relative) => {
      const data = fs.readFileSync(path.join(OUT, relative));
      return { path: relative, bytes: data.length, sha256: sha256(data) };
    })
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ task_count: manifest.task_count, mismatch_count: manifest.mismatch_count, output: path.relative(ROOT, OUT), files: manifest.files.length + 1 }));
}

main();
