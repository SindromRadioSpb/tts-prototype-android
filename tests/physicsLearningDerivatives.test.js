const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKET = path.join(ROOT, 'docs', 'research', 'physics-learning-derivatives', '2026-08-27');
const CORPUS = path.join(ROOT, 'docs', 'research', 'physics-corpus', '2026-08-24', 'physics-year1-corpus-records.json');
const BUILDER = path.join(ROOT, 'scripts', 'premium', 'build-physics-learning-derivatives.js');
const OUT = path.join(PACKET, 'artifacts');
const { normalizePhysicsNotation } = require(BUILDER);

function json(relative) {
  return JSON.parse(fs.readFileSync(path.join(PACKET, relative), 'utf8'));
}

function ids(entries) {
  return entries.map((entry) => entry.task_number).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('all ledgers match the exact 74-task corpus set', () => {
  const canonical = ids(JSON.parse(fs.readFileSync(CORPUS, 'utf8')).tasks);
  const answer = json('answer-ledger.json');
  const solution = json('solution-ledger.json');
  const localized = json('solution-ledger.ru.json');
  const exam = json('exam-solution-ledger.ru.json');
  assert.equal(new Set(canonical).size, 74);
  assert.deepEqual(ids(answer.entries), canonical);
  assert.deepEqual(ids(solution.entries), canonical);
  assert.deepEqual(ids(localized.entries), canonical);
  assert.deepEqual(ids(exam.entries), canonical);
  assert.equal(solution.review.handwritten_solution_used, true);
  assert.equal(solution.review.handwritten_solution_method, 'owner_authorized_visual_review_without_ocr');
  assert.deepEqual(solution.review.handwritten_solution_scope, ['1.5', '1.10', '6.1']);
  assert.equal(solution.review.answer_key_role, 'post_derivation_comparison_only');
  assert.deepEqual(
    ids(solution.entries.filter((entry) => entry.comparison === 'MISMATCH')),
    ['1.10', '2.3', '4.13', '6.2', '7.8', '8.1', '9.1']
  );
  assert.deepEqual(
    ids(solution.entries.filter((entry) => entry.review_disposition === 'OWNER_REVIEW_PENDING')),
    ['7.8', '8.1', '9.1']
  );
  assert.deepEqual(
    ids(solution.entries.filter((entry) => entry.review_disposition === 'OWNER_CONFIRMED_KEY_ERROR')),
    ['1.10', '2.3', '4.13', '6.2']
  );
  const task15 = solution.entries.find((entry) => entry.task_number === '1.5');
  assert.equal(task15.comparison, 'EXACT');
  assert.match(task15.result, /21 m\/s.*15 m\/s.*25\.2 m\/s.*18\.6 m\/s/);
  const task110 = solution.entries.find((entry) => entry.task_number === '1.10');
  assert.equal(task110.review_disposition, 'OWNER_CONFIRMED_KEY_ERROR');
  assert.match(task110.result, /601\.42 m/);
  for (const taskNumber of ['2.3', '4.13']) {
    const task = solution.entries.find((entry) => entry.task_number === taskNumber);
    assert.equal(task.comparison, 'MISMATCH');
    assert.equal(task.review_disposition, 'OWNER_CONFIRMED_KEY_ERROR');
    assert.match(task.comparison_note, /Owner review confirms the repository solution/);
  }
  const task62 = solution.entries.find((entry) => entry.task_number === '6.2');
  assert.equal(task62.comparison, 'MISMATCH');
  assert.equal(task62.review_disposition, 'OWNER_CONFIRMED_KEY_ERROR');
  assert.match(task62.comparison_note, /Owner review confirms the repository solution/);
  assert.match(task62.result, /25\.95 s/);
  const task61 = solution.entries.find((entry) => entry.task_number === '6.1');
  assert.equal(task61.comparison, 'EXACT');
  assert.match(task61.result, /192\.84 J.*154\.27 J.*-13\.79 J.*333\.3 J/);
  const task612 = solution.entries.find((entry) => entry.task_number === '6.12');
  assert.equal(task612.comparison, 'WITHIN_TOLERANCE');
  assert.equal(task612.review_disposition, undefined);
  assert.match(task612.result, /P_\{min\}=189\.24 N/);
  const exam612 = exam.entries.find((entry) => entry.task_number === '6.12');
  assert.match(exam612.symbolic.join('\n'), /P \* cos\(α\) \+ m_B \* g \* sin\(α\) = f_1 \+ μ_\{B-пл\} \* N_2/);
  assert.doesNotMatch(exam612.symbolic.join('\n'), /P \* cos\(α\) \+ \(m_A \+ m_B\) \* g \* sin\(α\)/);
  assert.match(exam612.check.join('\n'), /системы A\+B.*натяжение T/i);
  for (const entry of exam.entries) {
    for (const field of ['given', 'find', 'si', 'laws', 'symbolic', 'check']) {
      assert.ok(Array.isArray(entry[field]) && entry[field].length > 0, `${entry.task_number}.${field}`);
    }
    assert.ok(entry.symbolic.length >= 2, `${entry.task_number}: symbolic derivation is too short`);
    if (entry.calculation) {
      assert.ok(entry.calculation.length >= 2, `${entry.task_number}: explicit calculation is too short`);
    }
    if (entry.construction) {
      assert.ok(entry.construction.length >= 2, `${entry.task_number}: required construction is too short`);
    }
  }
  for (const taskNumber of ['1.3', '2.1', '6.1', '6.10', '6.11', '6.12']) {
    assert.ok(exam.entries.find((entry) => entry.task_number === taskNumber).construction, `${taskNumber}: missing required graph or force diagram`);
  }
});

test('builder is deterministic and manifests every generated learning artifact', () => {
  execFileSync(process.execPath, [BUILDER], { cwd: ROOT });
  const firstManifest = sha256(path.join(OUT, 'manifest.json'));
  const firstHtml = sha256(path.join(OUT, 'physics-year1-solutions.html'));
  execFileSync(process.execPath, [BUILDER], { cwd: ROOT });
  assert.equal(sha256(path.join(OUT, 'manifest.json')), firstManifest);
  assert.equal(sha256(path.join(OUT, 'physics-year1-solutions.html')), firstHtml);

  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.task_count, 74);
  assert.equal(manifest.mismatch_count, 7);
  assert.equal(manifest.confirmed_key_error_count, 4);
  assert.equal(manifest.open_mismatch_count, 3);
  assert.equal(manifest.handwritten_solution_used, true);
  assert.deepEqual(manifest.handwritten_solution_scope, ['1.5', '1.10', '6.1']);
  assert.equal(manifest.files.filter((file) => /^tasks\/task-\d+\.\d+\.md$/.test(file.path)).length, 74);
  assert.ok(manifest.files.some((file) => file.path === 'physics-year1-agent-guide.md'));
  for (const entry of manifest.files) {
    assert.equal(sha256(path.join(OUT, entry.path)), entry.sha256, entry.path);
  }
});

test('premium guide exposes provenance, Russian solution text and mismatch states', () => {
  const html = fs.readFileSync(path.join(OUT, 'physics-year1-solutions.html'), 'utf8');
  const report = fs.readFileSync(path.join(OUT, 'answer-comparison-report.md'), 'utf8');
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.match(html, /74 задачи/);
  assert.match(html, /4 подтверждённые ошибки ключа/);
  assert.match(html, /3 ожидают проверки/);
  assert.match(html, /Грузовик:/);
  assert.match(html, /Дано/);
  assert.match(html, /Найти/);
  assert.match(html, /Перевод в СИ и обозначения/);
  assert.match(html, /Базовые законы/);
  assert.match(html, /Вывод расчётных формул/);
  assert.match(html, /Подстановка и последовательный расчёт/);
  assert.match(html, /Проверка результата/);
  assert.equal((html.match(/class="exam-construction"/g) || []).length, 6);
  assert.match(html, /Три рукописных решения визуально сверены по разрешению владельца; OCR не применялся/i);
  assert.equal((html.match(/class="task(?: |")/g) || []).length, 74);
  assert.equal((html.match(/class="exam-sheet"/g) || []).length, 74);
  assert.equal((html.match(/class="task task--mismatch"/g) || []).length, 3);
  assert.equal((html.match(/class="task task--confirmed-key-error"/g) || []).length, 4);
  assert.match(html, /Ошибка ключа подтверждена/);
  assert.match(html, /12,295 с/);
  assert.match(html, /284,88 м/);
  assert.doesNotMatch(html, /G:\\|Andasa|Чистовик/);
  assert.match(report, /4 расхождения являются подтверждёнными владельцем ошибками ключа/);
  assert.match(report, /67 задач совпадают с ключом/);
  assert.match(report, /решение по 3 открытым расхождениям/);
  assert.doesNotMatch(report, /решение по семи открытым расхождениям/);
});

test('owner-reviewed tasks preserve the handwritten solution logic and exam sequence', () => {
  const task15 = fs.readFileSync(path.join(OUT, 'tasks', 'task-1.5.md'), 'utf8');
  assert.match(task15, /a = -0,6 м\/с\^2/);
  assert.match(task15, /v_0 = 21 м\/с/);
  assert.match(task15, /v_\{авто\} = [^\n]*25,2 м\/с/);
  assert.match(task15, /v_\{встр\} = [^\n]*18,6 м\/с/);
  assert.match(task15, /1\.5 верно\.pdf/);

  const task110 = fs.readFileSync(path.join(OUT, 'tasks', 'task-1.10.md'), 'utf8');
  assert.match(task110, /D = [^\n]*= 1780/);
  assert.match(task110, /отрицательн(?:ый|ого) кор(?:ень|ня).*отбрасываем/i);
  assert.match(task110, /601,42 м/);
  assert.match(task110, /OWNER_CONFIRMED_KEY_ERROR/);

  const task23 = fs.readFileSync(path.join(OUT, 'tasks', 'task-2.3.md'), 'utf8');
  assert.match(task23, /OWNER_CONFIRMED_KEY_ERROR/);
  assert.match(task23, /решение в репозитории и рукописное решение верны/i);

  const task413 = fs.readFileSync(path.join(OUT, 'tasks', 'task-4.13.md'), 'utf8');
  assert.match(task413, /OWNER_CONFIRMED_KEY_ERROR/);
  assert.match(task413, /решение в репозитории верно/i);

  const task62 = fs.readFileSync(path.join(OUT, 'tasks', 'task-6.2.md'), 'utf8');
  assert.match(task62, /OWNER_CONFIRMED_KEY_ERROR/);
  assert.match(task62, /решение в репозитории верно/i);
  assert.match(task62, /25,95 с/);

  const task61 = fs.readFileSync(path.join(OUT, 'tasks', 'task-6.1.md'), 'utf8');
  for (const token of ['192,84 Дж', '154,27 Дж', '-13,79 Дж', '333,3 Дж']) {
    assert.ok(task61.includes(token), `6.1: missing ${token}`);
  }
  assert.match(task61, /W_N = [^\n]*0 Дж/);
  assert.match(task61, /W_G = [^\n]*192,84 Дж/);
  assert.match(task61, /W_Q = [^\n]*154,27 Дж/);
  assert.doesNotMatch(task61, /W \* (?:N|G|Q)/);
  assert.match(task61, /6\.1 верно\.pdf/);
  assert.doesNotMatch(task61, /внутренне противоречиво|сумма работ обязана быть нулевой/i);

  const task612 = fs.readFileSync(path.join(OUT, 'tasks', 'task-6.12.md'), 'utf8');
  assert.match(task612, /comparison: WITHIN_TOLERANCE/);
  assert.match(task612, /P_\{min\} = 189,24 Н/);
  assert.match(task612, /P \* cos\(20°\) \+ m_B \* g \* sin\(20°\)/);
  assert.doesNotMatch(task612, /128,83 Н/);
  assert.doesNotMatch(task612, /P_m \* i \* n/);
});

test('every task has a complete exam protocol and carries every final value through the calculation', () => {
  const solutions = json('solution-ledger.ru.json');
  for (const solution of solutions.entries) {
    const file = path.join(OUT, 'tasks', `task-${solution.task_number}.md`);
    const markdown = fs.readFileSync(file, 'utf8');
    for (const heading of [
      '### Дано',
      '### Найти',
      '### Перевод в СИ и обозначения',
      '#### 1. Физическая модель',
      '#### 2. Базовые законы',
      '#### 3. Вывод расчётных формул',
      '#### 4. Подстановка и последовательный расчёт',
      '#### 5. Проверка результата',
      '## Ответ'
    ]) {
      assert.ok(markdown.includes(heading), `${solution.task_number}: missing ${heading}`);
    }
    const calculation = markdown
      .split('#### 4. Подстановка и последовательный расчёт')[1]
      .split('#### 5. Проверка результата')[0];
    assert.ok((calculation.match(/^\d+\. /gm) || []).length >= 2, `${solution.task_number}: calculation has fewer than two steps`);
    for (const token of solution.result.match(/\d+(?:[,.]\d+)?/g) || []) {
      assert.ok(calculation.includes(token), `${solution.task_number}: final value ${token} is absent from calculation`);
    }
    assert.ok(markdown.includes(`**${normalizePhysicsNotation(solution.result)}**`), `${solution.task_number}: final answer differs from reviewed result`);
  }
});

test('math notation is explicit for agents and typeset semantically for learners', () => {
  const task13 = fs.readFileSync(path.join(OUT, 'tasks', 'task-1.3.md'), 'utf8');
  const examProtocol = task13.split('## Экзаменационное решение')[1].split('## Ответ')[0];
  assert.match(examProtocol, /v_A = 0/);
  assert.match(examProtocol, /t_\{AC\}/);
  assert.match(examProtocol, /v\^2 = v_0\^2 \+ 2 \* a \* s/);
  assert.doesNotMatch(examProtocol, /vA=0|tAC|2as/);

  const task35 = fs.readFileSync(path.join(OUT, 'tasks', 'task-3.5.md'), 'utf8');
  assert.match(task35, /sin\(α\)/);
  assert.match(task35, /m \* g/);

  const html = fs.readFileSync(path.join(OUT, 'physics-year1-solutions.html'), 'utf8');
  assert.match(html, /<var>v<sub>A<\/sub><\/var>/);
  assert.match(html, /<var>v<\/var><sup>2<\/sup>/);
  assert.match(html, /<var>W<sub>N<\/sub><\/var>/);
  assert.doesNotMatch(html, /<var>W<\/var> <span class="math-op" aria-label="умножить">·<\/span> <var>[NGQ]<\/var>/);
  assert.match(html, /class="math-op" aria-label="умножить">·<\/span>/);
  assert.doesNotMatch(html, />vA=0<|>v²=v₀²\+2as</);
});

test('math normalizer removes ambiguous adjacency across the complete exam ledger', () => {
  const exam = json('exam-solution-ledger.ru.json');
  const allowedRuns = new Set([
    'sin', 'cos', 'tan', 'arctan', 'arccos', 'dt',
    'AB', 'AC', 'BC', 'BD', 'BE', 'CD', 'DE', 'MC', 'NC', 'OB', 'Ox'
  ]);
  for (const entry of exam.entries) {
    for (const [field, values] of Object.entries(entry)) {
      if (!Array.isArray(values)) continue;
      for (const source of values) {
        const normalized = normalizePhysicsNotation(source);
        const withoutIndexedSymbols = normalized.replace(/[A-Za-zΔΣμ]_(?:\{[^}]+\}|[A-Za-zА-Яа-я0-9])/g, '');
        assert.doesNotMatch(normalized, /[₀-₉ₓᵧ²³]/, `${entry.task_number}.${field}: convenience glyph remains`);
        assert.doesNotMatch(withoutIndexedSymbols, /\d(?=[A-Za-zαβγθφμτ])/, `${entry.task_number}.${field}: number-symbol product is implicit`);
        assert.doesNotMatch(normalized, /}(?=[A-Za-zαβγθφμτ])/, `${entry.task_number}.${field}: indexed-symbol product is implicit`);
        assert.doesNotMatch(normalized, /[A-Za-zαβγθφμτ}]\s+(?=(?:sin|cos|tan)\()/, `${entry.task_number}.${field}: function product is implicit`);

        for (const run of withoutIndexedSymbols.match(/[A-Za-z]{2,}/g) || []) {
          assert.ok(allowedRuns.has(run), `${entry.task_number}.${field}: unexplained adjacent symbols ${run}`);
        }
      }
    }
  }
  assert.equal(normalizePhysicsNotation('vB=√(vA²+2a₁AB)'), 'v_B = √(v_A^2 + 2 * a_1 * AB)');
  assert.equal(normalizePhysicsNotation('mAgsinα'), 'm_A * g * sin(α)');
  assert.equal(normalizePhysicsNotation('Ось Ox направлена вниз'), 'Ось Ox направлена вниз');
});
