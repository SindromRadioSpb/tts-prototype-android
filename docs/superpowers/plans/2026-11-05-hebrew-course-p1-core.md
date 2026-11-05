# Курс иврита P1 — ядро данных курса: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** формат урока v1 с проверенными парами «огласовка + полное письмо», валидатор курса, проверки графа и
проверяющий модуль ответов, в котором исправлены дефекты прототипа H1, H3, H4, M1, M2.

**Architecture:** три модуля `public/js/course-*.js` в стиле атласа: IIFE, `root.X = api` и `module.exports`.
Они работают и в браузере (P3), и в Node (тесты, сборка). Проверки графа и CLI — в `scripts/course/`.
Ничего не подключается к страницам, поэтому lockstep версий в P1 не нужен.

**Tech Stack:** Node 22, `node:test` + `node:assert/strict` (запуск через `npm test` → `scripts/test-unit.js`), без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md` (§4.3, §4.6, §6 п.7); дефекты — `docs/research/hebrew-course/2026-11-05-cafe-review/REVIEW.md`; дорожная карта — `docs/superpowers/plans/2026-11-05-hebrew-course-roadmap.md`.

## Global Constraints

- Каждая ивритская строка в данных — объект `{ "niqqud": "...", "plain": "...", "functional"?: "..." }`; `plain` никогда не выводится из `niqqud` удалением огласовок.
- Проверка ответа сравнивает ввод с обеими формами пары; огласовки во вводе не делают ответ «неизвестным».
- Вердикты: `empty | accepted | form | partial | mismatch | unknown`. `unknown` — техническая неопределённость, а не ошибка ученика.
- Тексты для ученика — по-русски, в объектах `{ "ru": "..." }` (место под `en` заложено форматом).
- ID: `^[A-Za-z0-9][A-Za-z0-9._-]*$`, уникальны в своей области; правка урока не меняет ID существующих реплик и заданий.
- Порог доли новых слов в учебном тексте — `0.08`, уровень «предупреждение».
- Работа ведётся в `.worktrees/course-core` на ветке `feat/course-core`. Пуш ветки на GitHub после каждой задачи. В main код идёт вместе с выпуском P3; документы — в main сразу с `[skip cd]`.

## Review Focus

1. Ввод с частичной огласовкой, макафом `־`, знаками направления U+200E/U+200F/U+202B, лишними пробелами и пунктуацией должен оцениваться так же, как чистый — тест в Task 1.
2. Омограф (`פה` «здесь» / «рот», `שם` «имя» / «там») сопоставляется со всеми кандидатами, и слот выбирает подходящий — тест в Task 3.
3. Ответ на кириллице, латинице или вставленный образец с русским переводом даёт `unknown`, а не падение и не `mismatch` — тест в Task 3.
4. Дублирующийся ID реплики или задания после правки урока ловится валидатором — тест в Task 2.
5. Согласие `כן` с ошибочным подтверждением — `mismatch` с названием слота, а с верным подтверждением — `accepted` — тест в Task 4.

---

### Task 1: Иврит — нормализация, токены, скелет пары

**Files:**
- Create: `public/js/course-hebrew.js`
- Test: `tests/courseHebrew.test.js`

**Interfaces:**
- Produces (`CourseHebrew`):
  - `stripMarks(s: string) -> string` — NFC, удаляет U+0591–U+05C7 (огласовки и кантилляцию; макаф U+05BE заменяет пробелом), U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF.
  - `tokens(s: string) -> string[]` — `stripMarks`, затем разбиение по всему, что не `[א-ת]` и не кириллица/латиница/цифры; пустые отброшены. Нееврейские токены сохраняются: по ним Task 3 узнаёт «чужой» ввод.
  - `skeleton(s: string) -> string` — `stripMarks`, оставить только `[א-ת]`, удалить все `ו` и `י`.
  - `formKeys(he: {niqqud, plain}) -> string[]` — уникальные `tokens(...)`, склеенные пробелом, для `stripMarks(niqqud)` и `plain`.
  - `pairConsistent(he) -> boolean` — `skeleton(niqqud) === skeleton(plain)`.

- [ ] **Step 1: Write the failing test** `tests/courseHebrew.test.js`

```js
const H = require('../public/js/course-hebrew.js');
test('stripMarks drops niqqud, bidi marks; maqaf becomes space', () => {
  assert.equal(H.stripMarks('‫בְּבַקָּשָׁה‏'), 'בבקשה');
  assert.equal(H.stripMarks('בֵּית־סֵפֶר'), 'בית ספר');
});
test('tokens keeps Hebrew words and foreign tokens, drops punctuation', () => {
  assert.deepEqual(H.tokens('  אֶפְשָׁר תֵּה,  בְּבַקָּשָׁה?! '), ['אפשר', 'תה', 'בבקשה']);
  assert.deepEqual(H.tokens('тэ бли сукар'), ['тэ', 'бли', 'сукар']);
});
test('formKeys covers defective and full spelling (H1: סֻכָּר vs סוכר)', () => {
  assert.deepEqual(H.formKeys({ niqqud: 'סֻכָּר', plain: 'סוכר' }).sort(), ['סוכר', 'סכר']);
});
test('pairConsistent accepts matres-only differences and rejects typos', () => {
  for (const [n, p] of [['שֻׁלְחָן', 'שולחן'], ['לִכְתֹּב', 'לכתוב'], ['מִכְנָסַיִם', 'מכנסיים'], ['כַּוָּנָה', 'כוונה']])
    assert.equal(H.pairConsistent({ niqqud: n, plain: p }), true, p);
  assert.equal(H.pairConsistent({ niqqud: 'סֻכָּר', plain: 'סוגר' }), false);
});
```

- [ ] **Step 2:** Run `node --test tests/courseHebrew.test.js` — Expected: FAIL, `Cannot find module '../public/js/course-hebrew.js'`.
- [ ] **Step 3:** Implement `public/js/course-hebrew.js` with the five functions above. Wrapper as in `public/js/atlas-reader.js`: `(function (root) { … root.CourseHebrew = api; if (typeof module !== 'undefined' && module.exports) module.exports = api; })(typeof window !== 'undefined' ? window : globalThis);`. Regexes use `\uXXXX` escapes only (no literal invisible characters in the source).
- [ ] **Step 4:** Run `node --test tests/courseHebrew.test.js` — Expected: PASS (4 tests).
- [ ] **Step 5:** Commit `feat(course): Hebrew normalization and niqqud/plain pair keys` and `git push -u origin feat/course-core`.

### Task 2: Формат урока v1 и валидатор

**Files:**
- Create: `public/js/course-format.js`
- Create: `docs/planning/course/COURSE_FORMAT_V1.md` (справочник формата; единственный канон полей)
- Create: `tests/fixtures/course/mini/course.json`, `lexicon.json`, `lessons/L001-cafe.json`, `lessons/L002-cafe-again.json`
- Test: `tests/courseFormat.test.js`

**Interfaces:**
- Consumes: `CourseHebrew.pairConsistent`, `CourseHebrew.stripMarks`.
- Produces (`CourseFormat`):
  - `HE_FIELDS` — список путей к ивритским объектам в уроке: `scene.turns[].he`, `text.paras[].he`, `tasks[].model`, `tasks[].answers[]`.
  - `validateLexicon(lexicon) -> Issue[]`
  - `validateLesson(lesson, lexiconIndex: Map<string, Entry>) -> Issue[]`
  - `Issue = { level: 'error'|'warning', code: string, path: string, message: string }`.

Формат (записать в `COURSE_FORMAT_V1.md` с примерами из фикстур):
- `course.json`: `{ format: "course-v1", id, version, title:{ru}, lexicon: "lexicon.json", lessons: [lessonId…], preknown: [lexId…] }`.
- `lexicon.json`: `{ entries: [{ id, pos, gender?: "m"|"f", he:{niqqud, plain, functional?}, translit_ru, gloss:{ru}, srcIds?: ["HEB0035"], forms?: [{ id, he, tags: ["f","sg"…] }] }] }`. Формы — отдельные ID в общем пространстве лексикона.
- урок: `{ format: "course-lesson-v1", id, version: int, title:{ru}, goal:{ru}, introduces:{active:[lexId], receptive:[lexId]}, reviews:[lexId], frame:[lexId], slots:[Slot], orderRules:[OrderRule], repeatForms:[[lexId…]], scene:{ id, roles:[{id, voice}], turns:[{id, role, he, ru, next?}] }, text?:{ id, paras:[{id, he, ru}] }, tasks:[Task], media?:[{ id, target, brief:{ru}, alt:{ru} }] }`.
- `Slot = { id, label:{ru}, head?: true, values: [{ key, label:{ru}, seq:[lexId…] }] }`; `OrderRule = { head: slotId, dependent: slotId, message:{ru} }`; `Task = { id, type: "choice"|"text"|"match"|"cloze"|"scene", channel: [...], prompt:{ru}, model?: he, answers?: [he], spec?: Spec, transfer?: boolean }`; `Spec` — в Task 3–4.

Коды ошибок (`error`): `FORMAT`, `ID_BAD`, `ID_DUP`, `HE_PAIR_MISSING`, `HE_PLAIN_HAS_MARKS`, `HE_SKELETON_MISMATCH`, `REF_UNKNOWN`, `TASK_TYPE_UNKNOWN`. Предупреждение: `HE_NIQQUD_BARE` (в `niqqud` есть буквы, но нет ни одной огласовки).

- [ ] **Step 1: Write the failing test** `tests/courseFormat.test.js`

```js
const F = require('../public/js/course-format.js');
const load = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/course/mini', n), 'utf8'));
const lex = load('lexicon.json'); const idx = new Map(lex.entries.flatMap(e => [[e.id, e], ...(e.forms || []).map(f => [f.id, f])]));
test('fixture lexicon and lessons are valid', () => {
  assert.deepEqual(F.validateLexicon(lex).filter(i => i.level === 'error'), []);
  for (const l of ['L001-cafe.json', 'L002-cafe-again.json'])
    assert.deepEqual(F.validateLesson(load('lessons/' + l), idx).filter(i => i.level === 'error'), [], l);
});
test('duplicate turn id after an edit is an error', () => {
  const l = load('lessons/L001-cafe.json'); l.scene.turns.push({ ...l.scene.turns[0] });
  assert.ok(F.validateLesson(l, idx).some(i => i.code === 'ID_DUP' && /scene\.turns/.test(i.path)));
});
test('plain derived by stripping niqqud is caught by skeleton, plain with marks is caught', () => {
  const l = load('lessons/L001-cafe.json');
  l.scene.turns[0].he = { niqqud: 'סֻכָּר', plain: 'סוגר' };
  l.scene.turns[1].he = { niqqud: 'שָׁלוֹם', plain: 'שָׁלוֹם' };
  const codes = F.validateLesson(l, idx).map(i => i.code);
  assert.ok(codes.includes('HE_SKELETON_MISMATCH')); assert.ok(codes.includes('HE_PLAIN_HAS_MARKS'));
});
test('missing pair half and unknown lexicon reference are errors', () => {
  const l = load('lessons/L001-cafe.json');
  l.scene.turns[0].he = { niqqud: 'שָׁלוֹם' }; l.introduces.active.push('lx.nope');
  const codes = F.validateLesson(l, idx).map(i => i.code);
  assert.ok(codes.includes('HE_PAIR_MISSING')); assert.ok(codes.includes('REF_UNKNOWN'));
});
```

- [ ] **Step 2:** Run `node --test tests/courseFormat.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3:** Write the fixtures. `L001-cafe`: scene «Кафе» из 8 реплик манифеста (`a1-01…a1-08`) с огласовкой из `docs/research/hebrew-course/2026-11-05-cafe-audio/bake-cafe-audio.js` (`NIQQUD`). Слоты `drink` (coffee/tea/water, `head: true`), `size`, `milk`, `sugar`, `service` (here: `[lx.lashevet]`, `[lx.po-here]`, `[lx.lashevet, lx.po-here]`; takeaway: `[lx.lakachat]`). `orderRules: [{ head: "drink", dependent: "size" }]`. `repeatForms`: `[lx.slicha, lx.efshar, lx.shuv]`, `[lx.shuv]`, `[lx.od, lx.paam]`, `[lx.ma]`, `[lx.lo, lx.hevanti]`, `[lx.efshar, lx.lachzor]`. Задания с ID `6`, `9`, `10a`, `13`, `18b`, `19d`, `19d-ok` и спеками из Task 3–4. В лексиконе есть `lx.po-here` и `lx.pe-mouth` с одинаковым `plain: "פה"`. `L002-cafe-again` — короткий урок, который повторяет `lx.bli` и `lx.chalav` и содержит `text` из 2 абзацев. Потом напиши `COURSE_FORMAT_V1.md` и реализуй `course-format.js`.
- [ ] **Step 4:** Run `node --test tests/courseFormat.test.js tests/courseHebrew.test.js` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(course): lesson format v1, validator and fixtures`; push.

### Task 3: Проверяющий модуль — слоты, порядок, согласование

**Files:**
- Create: `public/js/course-checker.js`
- Test: `tests/courseChecker.test.js`

**Interfaces:**
- Consumes: `CourseHebrew.tokens`, `CourseHebrew.formKeys`; формат слотов из Task 2.
- Produces (`CourseChecker`):
  - `buildIndex(lexiconEntries: Entry[]) -> Index` — `Map<token string, Array<{ lexId, baseId, gender?, tags }>>` для всех `formKeys` всех записей и форм; многословные ключи хранятся отдельно для поиска по последовательности.
  - `assess(input: string, task: Task, lesson: Lesson, index: Index) -> Result`; `Result = { kind, message:{ru}, detail?:{ru}, parsed: { slots: {slotId: key}, negated: {slotId: key}, unknownTokens: string[] } }`.
- Spec kinds this task: `order` `{ kind:"order", expect:{slotId:key}, require:[slotId], preferFrame?: [lexId] }` и `short` (как `order`; ожидаемые, но не требуемые слоты служат проверкой противоречий).

Алгоритм:
1. Токены сопоставляются со всеми кандидатами: омографы дают несколько кандидатов.
2. Слоты разбираются жадно по самой длинной последовательности `seq`.
3. `לא` прямо перед значением → запись в `negated`.
4. Два разных ключа одного слота без отрицания → `unknown` («противоречивые условия»). Одинаковые ключи (`לשבת פה`) противоречием не считаются (M1).
5. Ненулевые `unknownTokens`, то есть токены вне лексикона урока, кадра и `preknown`, → `unknown`.
6. Значение не совпадает с `expect` → `mismatch` с ярлыками обоих значений.
7. Нет обязательного слота → `partial` («Добавьте: <label>»).
8. Нарушено `orderRule` — зависимое значение стоит не сразу после головы, как в `גדול קפה` и `קפה עם חלב גדול` (M2), — или род формы зависимого ≠ род головы (`קפה גדולה`) → `form`.
9. Нет ни одного `preferFrame` → `accepted` с `detail` «Так заказать можно. Теперь попробуйте тот же заказ с אפשר.».

- [ ] **Step 1: Write the failing test** — таблица случаев (задания из фикстуры `L001-cafe`). Хелперы в начале файла: `lesson` — разобранный `L001-cafe.json`; `index = C.buildIndex(lexicon.entries)`; `task(id) = lesson.tasks.find(t => t.id === id)`.

```js
const cases = [
  ['6',   'אפשר תה בלי סוכר, בבקשה?',            'accepted'],
  ['6',   'תֵּה בְּלִי סֻכָּר, בְּבַקָּשָׁה',           'accepted'],   // H1
  ['6',   'תה בלי סוכר',                          'accepted'],   // with preferFrame detail
  ['6',   'אפשר תה בלי חלב',                      'partial'],
  ['6',   'אפשר תה עם סוכר',                      'mismatch'],
  ['6',   'אני רוצה תה בלי סוכר',                 'unknown'],
  ['6',   'тэ бли сукар',                         'unknown'],    // Review Focus 3
  ['6',   'אפשר תה בלי סוכר — Можно чай без сахара', 'unknown'],
  ['6',   '   ',                                  'empty'],
  ['9',   'אפשר קפה גדול עם חלב?',                'accepted'],
  ['9',   'אפשר קפה גדולה עם חלב',                'form'],
  ['9',   'אפשר גדול קפה עם חלב',                 'form'],
  ['9',   'אפשר קפה עם חלב גדול',                 'form'],       // M2
  ['10a', 'לשבת פה',                              'accepted'],   // M1
  ['10a', 'פה',                                   'accepted'],   // homograph, Review Focus 2
  ['10a', 'לקחת',                                 'mismatch'],
  ['6',   'אפשר‏ תֵה־בלי סוכר ,, בבקשה',      'accepted'],   // Review Focus 1
];
for (const [id, input, kind] of cases)
  test(`task ${id}: ${JSON.stringify(input)} -> ${kind}`, () => assert.equal(C.assess(input, task(id), lesson, index).kind, kind));
test('preferFrame detail and slot labels in messages', () => {
  assert.match(C.assess('תה בלי סוכר', task('6'), lesson, index).detail.ru, /אפשר/);
  assert.match(C.assess('אפשר תה עם סוכר', task('6'), lesson, index).message.ru, /с сахаром|без сахара/);
});
```

- [ ] **Step 2:** Run `node --test tests/courseChecker.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `buildIndex` and `assess` for kinds `order` and `short` in `public/js/course-checker.js` (same wrapper as Task 1). Сообщения: «Смысл передан.», «Добавьте: {label}.», «В задании нужно {expectLabel}, а в ответе — {gotLabel}.», «Для {headLabel} {dependentLabel} стоит сразу после названия и согласуется с его родом.», «Этот вариант не удаётся надёжно проверить автоматически. Сравните с образцом.»
- [ ] **Step 4:** Run `node --test tests/courseChecker.test.js tests/courseFormat.test.js tests/courseHebrew.test.js` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(course): slot checker with niqqud-aware matching, order and agreement`; push.

### Task 4: Проверяющий модуль — подтверждение, повтор, замена

**Files:**
- Modify: `public/js/course-checker.js`
- Modify: `tests/courseChecker.test.js`, `tests/fixtures/course/mini/lessons/L001-cafe.json`

**Interfaces:**
- Consumes: `assess` из Task 3.
- Produces: kinds
  - `confirm` `{ kind:"confirm", card:{slotId:key}, claim:{slotId:key} }`;
  - `repeat` (принимает любую `lesson.repeatForms`, допускаются слова кадра);
  - `replacement` `{ kind:"replacement", next:{slotId:key}, prev:{slotId:key}, via: lexId }`.

Правила `confirm`:
- `claim` совпадает с `card`: ответ только из `כן` / `בסדר` / `תודה` / `כן תודה` → `accepted`; `לא` без исправления → `mismatch` «Подтверждение было верным».
- `claim` ≠ `card`: чистое согласие → `mismatch`, сообщение называет слот (H3): «Вы согласились: {claimLabel}. По карточке нужно: {cardLabel}.» Ответ, где расходящийся слот исправлен на значение из `card`, с `לא` или без, → `accepted`. Исправление другого слота → `mismatch`.

`replacement`: `next` стоит перед `via`, `prev` — после; иначе `mismatch` «Сначала назовите то, что хотите получить теперь».

- [ ] **Step 1: Write the failing test**

```js
const more = [
  ['19d',    'כן',                 'mismatch'],   // claim milk:with, card milk:without — H3
  ['19d',    'כן, תודה',           'mismatch'],
  ['19d',    'בלי חלב',            'accepted'],
  ['19d',    'לא, בלי חלב, בבקשה', 'accepted'],
  ['19d',    'קטן',                'mismatch'],
  ['19d-ok', 'כן, תודה',           'accepted'],   // claim == card
  ['19d-ok', 'לא',                 'mismatch'],
  ['13',     'סליחה, עוד פעם?',    'accepted'],   // H4
  ['13',     'מה?',                'accepted'],
  ['13',     'לא הבנתי',           'accepted'],
  ['13',     'אפשר לחזור?',        'accepted'],
  ['13',     'סליחה, אפשר שוב?',   'accepted'],
  ['13',     'שלום',               'unknown'],
  ['18b',    'אפשר קפה במקום תה',  'accepted'],
  ['18b',    'אפשר תה במקום קפה',  'mismatch'],
];
test('confirm mismatch names the slot', () =>
  assert.match(C.assess('כן', task('19d'), lesson, index).message.ru, /молок/));
```

- [ ] **Step 2:** Run `node --test tests/courseChecker.test.js` — Expected: the new cases FAIL.
- [ ] **Step 3:** Implement the three kinds in `assess`; add tasks `13`, `18b`, `19d`, `19d-ok` to the fixture if Task 2 left them partial.
- [ ] **Step 4:** Run `npm test -- tests/courseChecker.test.js` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(course): confirm, repeat and replacement checks (H3, H4)`; push.

### Task 5: Проверки графа и CLI валидации курса

**Files:**
- Create: `scripts/course/course-graph.cjs`, `scripts/course/validate-course.cjs`
- Modify: `package.json` (скрипт `"course:validate": "node scripts/course/validate-course.cjs"`)
- Test: `tests/courseGraph.test.js`

**Interfaces:**
- Consumes: `CourseFormat.validateLexicon/validateLesson`, `CourseChecker.buildIndex`, `CourseHebrew.tokens`.
- Produces:
  - `checkGraph({ course, lexicon, lessons }) -> Issue[]` из `course-graph.cjs`;
  - CLI `node scripts/course/validate-course.cjs <courseDir> [--json]`: печатает проблемы `уровень код урок путь сообщение`; выход 1, если есть `error`.

Проверки:
- `NO_TRANSFER` (error) — в уроке нет задания с `transfer: true`.
- `REQUIRES_UNMET` (error) — `lexId` из `slots`, `repeatForms`, `frame` или токенов `model`/`answers` заданий не введён ни в этом, ни в предыдущих уроках и не входит в `course.preknown`.
- `TEXT_UNKNOWN_TOKEN` (error) — токен `text` не найден в лексиконе.
- `TEXT_DENSITY` (warning) — доля токенов `text`, относящихся к единицам, введённым в этом уроке, больше `0.08`.
- `REAPPEAR_LOW` (warning) — активная единица встречается (по токенам реплик, текста, моделей) меньше чем в 3 последующих уроках; если последующих уроков меньше 3, проверка откладывается, и выводится `REAPPEAR_PENDING` (warning).

- [ ] **Step 1: Write the failing test** `tests/courseGraph.test.js`

```js
const { checkGraph } = require('../scripts/course/course-graph.cjs');
test('mini course has no errors; reappearance is pending with 2 lessons', () => {
  const issues = checkGraph(loadMini());
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  assert.ok(issues.some(i => i.code === 'REAPPEAR_PENDING'));
});
test('lesson without transfer task is an error', () => {
  const c = loadMini(); c.lessons[1].tasks.forEach(t => delete t.transfer);
  assert.ok(checkGraph(c).some(i => i.code === 'NO_TRANSFER' && i.lessonId === 'L002-cafe-again'));
});
test('using a word before it is introduced is an error', () => {
  const c = loadMini(); // lx.ein is introduced only in L002
  c.lessons[0].tasks[0].model = { niqqud: 'אֵין חָלָב', plain: 'אין חלב' };
  assert.ok(checkGraph(c).some(i => i.code === 'REQUIRES_UNMET' && i.lessonId === 'L001-cafe'));
});
test('dense new words in study text are a warning', () => {
  const c = loadMini(); c.lessons[1].introduces.receptive.push(...c.lessons[1].text.paras.flatMap(p => idsIn(p.he, c)));
  assert.ok(checkGraph(c).some(i => i.code === 'TEXT_DENSITY' && i.level === 'warning'));
});
test('CLI exits 0 on the mini course and 1 on a broken copy', () => {
  assert.equal(run(['tests/fixtures/course/mini']).status, 0);
  assert.equal(run([brokenCopy()]).status, 1);
});
```

(`loadMini()` собирает `{course, lexicon, lessons}` из фикстуры; `idsIn(he, c)` — ID единиц, которые находит индекс; `brokenCopy()` пишет копию фикстуры с удалённым `transfer` во временную папку `os.tmpdir()`; `run(args)` — `spawnSync(process.execPath, ['scripts/course/validate-course.cjs', ...args])`. Фикстура Task 2 содержит `lx.ein` в лексиконе и вводит его в `L002-cafe-again`, а не в `L001-cafe`.)

- [ ] **Step 2:** Run `node --test tests/courseGraph.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `course-graph.cjs` (`checkGraph`) and `validate-course.cjs`. CLI читает `course.json`, `lexicon.json` и `lessons/<id>.json` в порядке `course.lessons`, затем выполняет `validateLexicon`, `validateLesson` и `checkGraph`.
- [ ] **Step 4:** Run `npm test` — Expected: весь набор зелёный (включая 5 новых файлов тестов курса).
- [ ] **Step 5:** Commit `feat(course): graph checks and course:validate CLI`; push. В отчёте назвать ветку `feat/course-core` и коммит: она — второй источник истины до слияния с выпуском P3.
