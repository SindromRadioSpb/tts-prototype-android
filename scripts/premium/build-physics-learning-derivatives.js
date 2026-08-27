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
const EXAM_SOLUTION_PATH = path.join(PACKET, 'exam-solution-ledger.ru.json');
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

function markdownList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function htmlList(items, className = '') {
  return `<ul${className ? ` class="${className}"` : ''}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function expandExamItems(items) {
  return items.flatMap((item) => String(item)
    .split(/;\s*/)
    .map((part) => part.trim())
    .filter(Boolean));
}

function calculationStepsFor(solution) {
  const steps = [...(solution.exam.calculation || solution.derivation)];
  const numericTokens = solution.result.match(/\d+(?:[,.]\d+)?/g) || [];
  const calculationText = steps.join(' ');
  const hasEveryResultValue = numericTokens.every((token) => calculationText.includes(token));
  if (!hasEveryResultValue) {
    steps.push(`Окончательно, после вычисления и округления: ${solution.result}.`);
  }
  return steps;
}

function markdownForTask(task, answer, solution) {
  const ru = conditionRows(task, 'ru').map((text) => `- ${text}`).join('\n');
  const he = conditionRows(task, 'he_plain').map((text) => `- ${text}`).join('\n');
  const calculationSteps = calculationStepsFor(solution);
  const calculation = calculationSteps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const symbolic = solution.exam.symbolic.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const construction = solution.exam.construction
    ? `\n#### Обязательное построение\n\n${markdownList(solution.exam.construction)}\n`
    : '';
  const warning = solution.comparison === 'MISMATCH'
    ? `\n> Важно: **расхождение с ключом**. ${solution.comparison_note}\n`
    : '';
  return `---
schema: physics_task_learning_derivative.2.0.0
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

## Экзаменационное решение

### Дано

${markdownList(expandExamItems(solution.exam.given))}

### Найти

${markdownList(expandExamItems(solution.exam.find))}

### Перевод в СИ и обозначения

${markdownList(expandExamItems(solution.exam.si))}

### Решение

#### 1. Физическая модель

${solution.model}

#### 2. Базовые законы

${markdownList(solution.exam.laws)}

#### 3. Вывод расчётных формул

${symbolic}
${construction}

#### 4. Подстановка и последовательный расчёт

${calculation}

#### 5. Проверка результата

${markdownList(solution.exam.check)}

## Ответ

**${solution.result}**

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
schema: physics_agent_learning_guide.2.0.0
corpus: physics-year1-problems
task_count: 74
locale: ru
handwritten_solution_used: false
publication_status: LOCAL_REVIEW_ONLY
---

# Физика — задачник, 1 год: независимые решения

Этот файл предназначен для поиска и работы агента. Каждая секция содержит
каноническое условие, «Дано» и «Найти», перевод в СИ, базовые законы,
символический вывод, последовательный численный расчёт, проверку и ответ,
сверку с ключом и происхождение. Ответы из ключа открывались только после
вывода; рукописные решения не распознавались и не использовались.

${taskDocuments.join('\n\n---\n\n')}`;
}

function renderTaskCard(task, answer, solution) {
  const mismatch = solution.comparison === 'MISMATCH';
  const ru = conditionRows(task, 'ru').map((text) => `<p>${escapeHtml(text)}</p>`).join('');
  const he = conditionRows(task, 'he_plain').map((text) => `<p>${escapeHtml(text)}</p>`).join('');
  const calculationSteps = calculationStepsFor(solution);
  const calculation = calculationSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  const symbolic = solution.exam.symbolic.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  const construction = solution.exam.construction
    ? `<section class="exam-construction"><h4>Обязательное построение</h4>${htmlList(solution.exam.construction)}</section>`
    : '';
  const answerParts = answer.parts.map((part) => `<li><b>${escapeHtml(part.label || '—')}</b> ${escapeHtml(part.text)}</li>`).join('');
  return `<article class="task ${mismatch ? 'task--mismatch' : ''}" id="task-${task.task_number}" data-task="${task.task_number}" data-search="${escapeHtml(`${task.task_number} ${conditionRows(task, 'ru').join(' ')}`.toLowerCase())}">
    <header class="task__header">
      <div><span class="eyebrow">Задача ${task.task_number}</span><h2>Полное экзаменационное решение</h2></div>
      <span class="verdict verdict--${mismatch ? 'warn' : 'ok'}">${mismatch ? 'Проверить расхождение' : 'Сверено'}</span>
    </header>
    <div class="evidence-rail" aria-label="Этапы проверки"><span>условие</span><i></i><span>модель</span><i></i><span>вывод</span><i></i><span>ответ</span><i></i><span>сверка</span></div>
    <section class="condition"><h3>Условие</h3>${ru}</section>
    <details class="hebrew"><summary>Оригинал на иврите</summary><div dir="rtl" lang="he">${he}</div></details>
    <div class="attempt"><b>Пауза перед решением</b><span>Выпишите данные, выберите оси и попробуйте получить формулу самостоятельно.</span></div>
    <details class="hint"><summary>Подсказка: физическая модель</summary><p>${escapeHtml(solution.model)}</p></details>
    <details class="solution"><summary>Показать полное экзаменационное решение</summary><div class="exam-sheet">
      <div class="exam-ledger"><section><h4>Дано</h4>${htmlList(expandExamItems(solution.exam.given))}</section><section><h4>Найти</h4>${htmlList(expandExamItems(solution.exam.find))}</section></div>
      <section class="exam-si"><h4>Перевод в СИ и обозначения</h4>${htmlList(expandExamItems(solution.exam.si))}</section>
      <section class="exam-step"><b class="step-no">01</b><div><h4>Физическая модель</h4><p>${escapeHtml(solution.model)}</p></div></section>
      <section class="exam-step"><b class="step-no">02</b><div><h4>Базовые законы</h4>${htmlList(solution.exam.laws, 'formula-list')}</div></section>
      <section class="exam-step"><b class="step-no">03</b><div><h4>Вывод расчётных формул</h4><ol>${symbolic}</ol></div></section>
${construction}
      <section class="exam-step"><b class="step-no">04</b><div><h4>Подстановка и последовательный расчёт</h4><ol>${calculation}</ol></div></section>
      <section class="exam-step exam-check"><b class="step-no">05</b><div><h4>Проверка результата</h4>${htmlList(solution.exam.check)}</div></section>
      <p class="result"><span>Ответ</span>${escapeHtml(solution.result)}</p>
    </div></details>
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
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Физика — 74 экзаменационных решения</title>
<style>
:root{--ink:#182128;--paper:#f2efe7;--panel:#fffdf7;--blue:#155d83;--blue2:#0b3954;--amber:#d89022;--red:#a43b32;--line:#c8c4b8;--muted:#66727a;--shadow:0 18px 48px #102b3a18}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--paper);font:16px/1.6 "Segoe UI",Arial,sans-serif;background-image:linear-gradient(#155d8309 1px,transparent 1px),linear-gradient(90deg,#155d8309 1px,transparent 1px);background-size:24px 24px}a{color:inherit}.masthead{padding:64px max(24px,calc((100vw - 1120px)/2));background:var(--blue2);color:#fff;position:relative;overflow:hidden}.masthead:after{content:"";position:absolute;inset:auto -8% -160px 42%;height:320px;border:48px solid #ffffff0c;border-radius:50%;transform:rotate(-14deg)}.kicker,.eyebrow{text-transform:uppercase;letter-spacing:.15em;font-weight:800;font-size:.72rem}.masthead h1{font:700 clamp(2.4rem,7vw,5.8rem)/.95 Georgia,serif;max-width:900px;margin:.3em 0}.masthead p{max-width:720px;color:#dbeaf1}.stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.stats span{border:1px solid #ffffff33;padding:8px 12px;border-radius:999px}.toolbar{position:sticky;top:0;z-index:9;background:#f2efe7ee;backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:10px max(16px,calc((100vw - 1120px)/2));display:flex;gap:12px;align-items:center}.toolbar nav{display:flex;gap:6px;overflow:auto}.toolbar a{min-width:38px;text-align:center;text-decoration:none;padding:7px;border:1px solid var(--line);border-radius:4px;background:#fff}.toolbar input{margin-left:auto;min-width:250px;padding:10px 12px;border:1px solid var(--line);background:white;border-radius:4px}.content{max-width:1120px;margin:auto;padding:36px 24px 100px}.chapter{scroll-margin-top:76px}.chapter__header{display:grid;grid-template-columns:110px 1fr auto;align-items:end;gap:20px;margin:60px 0 20px;border-bottom:4px solid var(--blue2)}.chapter__header span,.chapter__header b{padding-bottom:12px;color:var(--blue)}.chapter__header h1{margin:0;font:700 clamp(1.7rem,4vw,3rem)/1.05 Georgia,serif;padding-bottom:10px}.task{scroll-margin-top:76px;background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--blue);padding:28px;margin:18px 0;box-shadow:var(--shadow)}.task--mismatch{border-left-color:var(--red)}.task__header{display:flex;justify-content:space-between;gap:24px;align-items:start}.task__header h2{font:700 1.35rem/1.2 Georgia,serif;margin:.3rem 0 0}.verdict{font-size:.75rem;font-weight:800;padding:6px 10px;border-radius:3px;background:#e4f1e8;color:#24633a;white-space:nowrap}.verdict--warn{background:#f7e4df;color:#8b2f28}.evidence-rail{display:flex;align-items:center;gap:8px;color:var(--blue);font-size:.72rem;font-weight:800;margin:22px 0;text-transform:uppercase;letter-spacing:.08em}.evidence-rail i{height:1px;min-width:12px;flex:1;background:var(--amber)}h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.12em;color:var(--blue);margin-top:24px}.condition p{margin:.7em 0}.attempt{display:flex;gap:16px;border:1px dashed var(--amber);padding:14px;margin:20px 0;background:#fff8e8}.attempt span{color:var(--muted)}details{border-top:1px solid var(--line);padding:12px 0}summary{cursor:pointer;font-weight:750;color:var(--blue2)}details p,details ol,details ul{margin-left:18px;margin-right:18px}.hebrew div{font-size:1.1rem}.result{border-left:3px solid var(--amber);padding:12px;background:#fff8e8}.result span{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:.68rem;font-weight:800;color:#8c5b11}.comparison{display:inline-block;background:#e4f1e8;color:#24633a;padding:4px 8px;font-weight:800}.comparison--warn{background:#f7e4df;color:#8b2f28}.task footer{display:flex;justify-content:space-between;color:var(--muted);font-size:.75rem;margin-top:20px}code{font-family:Consolas,monospace}.no-results{display:none;padding:50px;text-align:center;color:var(--muted)}@media(max-width:700px){.masthead{padding:44px 20px}.toolbar{align-items:stretch;flex-direction:column}.toolbar input{margin:0;min-width:0;width:100%}.content{padding:18px 12px 70px}.chapter__header{grid-template-columns:1fr auto}.chapter__header h1{grid-column:1/-1}.task{padding:20px 16px}.task__header{display:block}.verdict{display:inline-block;margin-top:12px}.evidence-rail{overflow:auto}.attempt{display:block}.task footer{display:block}.task footer code{display:block;margin-top:6px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{.toolbar,.attempt{display:none}.masthead{background:#fff;color:#000;padding:20px}.masthead p{color:#333}.content{max-width:none;padding:0}.task{break-inside:avoid;box-shadow:none}.solution[open],.answer[open]{display:block}details{display:block}details>summary{font-weight:bold}}
</style><style>
.exam-sheet{margin:18px 0 8px;padding:24px 26px 28px 54px;background-color:#fff;background-image:linear-gradient(90deg,transparent 0,transparent 31px,#cf5b561f 32px,#cf5b561f 33px,transparent 34px),repeating-linear-gradient(0deg,transparent 0,transparent 31px,#155d8310 32px);border:1px solid #b9c3c8;box-shadow:inset 0 0 0 5px #f7f9fa;position:relative;max-width:100%;overflow-wrap:anywhere}.exam-sheet:before{content:"ПРОТОКОЛ РЕШЕНИЯ";position:absolute;left:10px;top:26px;writing-mode:vertical-rl;transform:rotate(180deg);font:800 .62rem/1 "Segoe UI",sans-serif;letter-spacing:.14em;color:#9e403b}.exam-sheet h4{margin:0 0 8px;font:800 .76rem/1.25 "Segoe UI",sans-serif;letter-spacing:.11em;text-transform:uppercase;color:var(--blue2)}.exam-sheet ul,.exam-sheet ol{margin:0;padding-left:1.35rem}.exam-sheet li{margin:.5rem 0}.exam-ledger{display:grid;grid-template-columns:1.4fr 1fr;border:1px solid #82939b;background:#ffffffd9}.exam-ledger section{padding:16px;min-width:0}.exam-ledger section+section{border-left:1px solid #82939b}.exam-si{margin:14px 0 2px;padding:14px 16px;border-left:4px solid var(--amber);background:#fff8e9}.exam-step{display:grid;grid-template-columns:42px minmax(0,1fr);gap:14px;padding:20px 0;border-top:1px solid #9daab0}.exam-step>div{min-width:0}.step-no{font:800 1rem/1 Consolas,monospace;color:#9e403b;padding-top:3px}.exam-step>div>p{margin:.2rem 0}.formula-list{font:600 .96rem/1.65 Cambria,"Times New Roman",serif}.formula-list li::marker{color:var(--amber)}.exam-construction{margin:2px 0 4px;padding:16px 18px;border:1px dashed #8b5e2b;background:#fff9ec}.exam-construction h4{color:#7b4d18}.exam-construction li{font-family:Cambria,"Times New Roman",serif}.exam-check{background:#edf5f1;margin:0 -8px;padding:18px 8px}.exam-check h4{color:#296044}.exam-sheet .result{margin:20px 0 0;font:700 1rem/1.55 Cambria,"Times New Roman",serif;border:2px solid var(--blue2);background:#f5fafc}.solution>summary{font-size:1.02rem}.solution[open]>summary{margin-bottom:14px}
@media(max-width:700px){.masthead h1{overflow-wrap:anywhere}.toolbar nav{width:100%;min-width:0;max-width:100%;white-space:nowrap}.attempt span{display:block;margin-top:8px}.exam-sheet{padding:18px 14px 22px 34px;margin-left:-6px;margin-right:-6px}.exam-sheet:before{left:7px}.exam-ledger{grid-template-columns:1fr}.exam-ledger section+section{border-left:0;border-top:1px solid #82939b}.exam-step{grid-template-columns:30px minmax(0,1fr);gap:8px}.exam-sheet ol,.exam-sheet ul{padding-left:1.1rem}}
@media print{details>*:not(summary){display:block!important}.exam-sheet{box-shadow:none;break-inside:auto}.exam-step{break-inside:avoid}.task{break-inside:auto}}
</style></head><body>
<header class="masthead"><span class="kicker">LinguistPro · экзаменационная физика</span><h1>74 задачи.<br>От «дано» до ответа.</h1><p>Полные решения в формате колледжа: обозначения и СИ, базовые законы, символический вывод, последовательная подстановка и проверка результата. Ключ использован только после независимого решения; рукописные работы не использовались.</p><div class="stats"><span>74 задачи</span><span>9 глав</span><span>${mismatchCount} расхождений</span><span>экзаменационный R2</span></div></header>
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
  return `# Отчёт о сверке ответов по физике

Дата: 2026-08-27
Охват: 74/74 задачи
Метод: сначала полное независимое решение, затем сверка с ключом
Использование рукописных решений: нет

## Результат

- 74 уникальные записи точно соответствуют каноническому набору корпуса.
- ${74 - mismatches.length} задачи совпадают с ключом в пределах объявленного округления.
- ${mismatches.length} задач имеют существенное расхождение или противоречие источника.
- Расхождение никогда не устраняется расширением допуска.

## Расхождения, требующие решения владельца

| Задача | Независимый результат | Вывод проверки |
|---|---|---|
${rows}

## Шлюз публикации

Локальная производная не разрешена к публикации в production. Необходимо принять
решение по каждому расхождению, выполнить второй проход владельца по переносу ответов
и подтвердить права на публикацию в соответствии с планами R1/R2.
`;
}

function main() {
  const corpus = readJson(CORPUS_PATH);
  const answerLedger = readJson(ANSWER_PATH);
  const solutionLedger = readJson(SOLUTION_PATH);
  const solutionRuLedger = readJson(SOLUTION_RU_PATH);
  const examSolutionLedger = readJson(EXAM_SOLUTION_PATH);
  const answerMap = indexByTask(answerLedger.entries, 'answer ledger');
  const sourceSolutionMap = indexByTask(solutionLedger.entries, 'solution ledger');
  const solutionRuMap = indexByTask(solutionRuLedger.entries, 'Russian solution localization');
  const examSolutionMap = indexByTask(examSolutionLedger.entries, 'exam solution ledger');
  compareTaskSets(corpus.tasks, answerMap, sourceSolutionMap);
  compareTaskSets(corpus.tasks, answerMap, solutionRuMap);
  compareTaskSets(corpus.tasks, answerMap, examSolutionMap);
  for (const [taskNumber, exam] of examSolutionMap) {
    for (const field of ['given', 'find', 'si', 'laws', 'symbolic', 'check']) {
      assert(Array.isArray(exam[field]) && exam[field].length > 0, `${taskNumber}: missing exam field ${field}`);
    }
    assert(exam.symbolic.length >= 2, `${taskNumber}: symbolic derivation is too short`);
    if (exam.construction) {
      assert(Array.isArray(exam.construction) && exam.construction.length > 0, `${taskNumber}: invalid construction`);
    }
  }
  const solutionMap = new Map(corpus.tasks.map((task) => {
    const source = sourceSolutionMap.get(task.task_number);
    const localized = solutionRuMap.get(task.task_number);
    const exam = examSolutionMap.get(task.task_number);
    return [task.task_number, { ...source, ...localized, comparison: source.comparison, exam }];
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
