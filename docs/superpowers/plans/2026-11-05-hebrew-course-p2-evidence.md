# Курс иврита P2 — модель доказательств и прогресс: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** неизменяемые записи попыток с каналом и помощью, отпечаток новизны задания, вычисление статусов слов
(введено / узнаёт при чтении / узнаёт на слух / отвечает сам / применил после перерыва) и умений урока,
миграция прогресса при новой версии урока, локальное хранилище через интерфейс.

**Architecture:** два модуля в стиле P1:
- `public/js/course-evidence.js` — чистые функции над объектом `Progress`, без DOM и хранилища;
- `public/js/course-store.js` — интерфейс хранилища и две реализации: в памяти и `localStorage`.

Синхронизация между устройствами и FSRS — в P7: там `CourseStore` получит третью реализацию, функции P2
не меняются. К страницам ничего не подключается.

**Tech Stack:** Node 22, `node:test`, без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-05-hebrew-course-corpus-design.md` §2 (цели 4–6), §4.2 п. 1–2, §6а; P1 — `docs/superpowers/plans/2026-11-05-hebrew-course-p1-core.md` (формат урока, вердикты `CourseChecker`).

## Global Constraints

- Попытка неизменяема после записи. Помощь, открытая позже, влияет только на следующие попытки (свойство прототипа `attempts.mjs`).
- Каналы: `read`, `listen`, `write_he`, `cards`, `translit`, `speech`, `self`, `ai`. Помощь: `hint` (число), `model`, `transcript`, `translation` (булевы).
- «Самостоятельно» = вердикт `accepted` с первой попытки по этому отпечатку, без помощи, в каналах `write_he` / `speech` (производство) или `read` / `listen` (узнавание). `cards`, `translit`, `self` никогда не дают «отвечает сам»; `ai` даёт «отвечает сам» только с пометкой `via: "ai"`.
- «Применил после перерыва» = «самостоятельно» в задании с `transfer: true`, отпечаток которого ученик раньше не видел, и не раньше чем через `BREAK_MS = 20 * 60 * 60 * 1000` после первой встречи с единицей.
- Ничто не бросает исключений наружу из хранилища: ошибки чтения и записи возвращаются значением.
- Ветка `feat/course-evidence` от актуального `origin/main` с влитой `feat/course-core` (P1 ещё не в main: `git merge origin/feat/course-core` первым коммитом). Пуш ветки после каждой задачи; в main — с выпуском P3.

## Review Focus

1. Двойное событие (повторный click/change за < 1 с с тем же вводом) не создаёт вторую попытку — тест в Task 1.
2. Повреждённый или чужой JSON в `localStorage` → чистый прогресс и `notice: "reset_corrupt"`, старые данные сохраняются под ключом `…:corrupt:<ts>` — тест в Task 4.
3. Переполнение хранилища при записи → `{ ok: false, reason: "quota" }`, прогресс в памяти цел — тест в Task 4.
4. Время попытки раньше времени первой встречи (сбитые часы) не даёт «после перерыва» — тест в Task 2.
5. Образец открыт, потом дан верный ответ → «с опорой», а не «самостоятельно», и после перезагрузки тоже — тест в Task 1.

---

### Task 1: Попытки, помощь, отпечаток

**Files:** Create `public/js/course-evidence.js`; Test `tests/courseEvidence.test.js`

**Interfaces:**
- Consumes: `Result` из `CourseChecker.assess` (`kind`).
- Produces (`CourseEvidence`):
  - `emptyProgress(courseId) -> Progress`, где `Progress = { courseId, schema: 1, attempts: Attempt[], aids: {[taskKey]: Aids}, seen: {[fingerprint]: firstAt}, firstMet: {[lexId]: firstAt}, lessonVersions: {[lessonId]: version} }`;
  - `fingerprint(lessonId, task, variant?) -> string` — FNV-1a 32 бита, hex, от канонического JSON `{ lessonId, taskId, spec, model, variant }` (ключи отсортированы рекурсивно);
  - `openAid(progress, taskKey, aid: 'hint'|'model'|'transcript'|'translation', at) -> Progress`;
  - `record(progress, { lessonId, lessonVersion, task, variant?, channel, input, result, at }) -> { progress, attempt, duplicate: boolean }`;
  - `Attempt = { id, lessonId, lessonVersion, taskId, fp, channel, input, kind, aids: Aids, first: boolean, at }`, `Aids = { hint: number, model: boolean, transcript: boolean, translation: boolean }`;
  - `taskKey = lessonId + '/' + taskId`.

Правила `record`:
- `aids` — снимок текущих `progress.aids[taskKey]`;
- `first = !progress.seen[fp]`;
- `seen[fp]` ставится при первой попытке;
- дубликат = последняя попытка с тем же `taskKey`, `input` и `channel` моложе 1000 мс → `duplicate: true`, прогресс не меняется;
- после записи `aids[taskKey]` не сбрасывается: помощь остаётся видимой до новой версии задания.

- [ ] **Step 1: Write the failing test**

```js
const E = require('../public/js/course-evidence.js');
const task = { id: '6', spec: { kind: 'order', expect: { drink: 'tea', sugar: 'without' } }, model: { niqqud: 'תֵּה', plain: 'תה' } };
test('fingerprint is stable under key order and changes with the variant', () => {
  const a = E.fingerprint('L001', task), b = E.fingerprint('L001', { model: task.model, spec: task.spec, id: '6' });
  assert.equal(a, b); assert.notEqual(a, E.fingerprint('L001', task, { drink: 'coffee' }));
  assert.match(a, /^[0-9a-f]{8}$/);
});
test('double event within 1 s is a duplicate', () => {
  let p = E.emptyProgress('ulpan'); const base = { lessonId: 'L001', lessonVersion: 1, task, channel: 'write_he', input: 'תה בלי סוכר', result: { kind: 'accepted' } };
  p = E.record(p, { ...base, at: 1000 }).progress;
  const r = E.record(p, { ...base, at: 1600 });
  assert.equal(r.duplicate, true); assert.equal(r.progress.attempts.length, 1);
});
test('model opened before answering is captured in the attempt snapshot', () => {
  let p = E.openAid(E.emptyProgress('ulpan'), 'L001/6', 'model', 500);
  const { attempt } = E.record(p, { lessonId: 'L001', lessonVersion: 1, task, channel: 'write_he', input: 'x', result: { kind: 'accepted' }, at: 900 });
  assert.equal(attempt.aids.model, true); assert.equal(attempt.first, true);
});
```

- [ ] **Step 2:** `node --test tests/courseEvidence.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement the functions in `public/js/course-evidence.js`. The wrapper is the same as `course-hebrew.js`. All functions return new objects (`structuredClone` of the input + the change) and never mutate the argument.
- [ ] **Step 4:** `node --test tests/courseEvidence.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(course): immutable attempts, aids snapshot and task fingerprint`; push.

### Task 2: Статусы слов, умений и счётчик курса

**Files:** Modify `public/js/course-evidence.js`; Test `tests/courseEvidence.test.js`

**Interfaces:**
- Consumes: `Progress`, `Attempt` (Task 1); уроки и лексикон P1 (`introduces`, `tasks[].spec`, `tasks[].transfer`).
- Produces:
  - `markMet(progress, lexIds: string[], at) -> Progress` — ставит `firstMet` только у ещё не встреченных;
  - `attemptLevel(attempt) -> 'independent'|'supported'|'none'` — по правилам Global Constraints;
  - `itemStatus(progress, lexId, lessons) -> { introduced, readOk, listenOk, produced, appliedAfterBreak }` (булевы). Единица считается затронутой попыткой, если её `lexId` входит в `seq` слотов, которые требует `spec`, или в `introduces` урока задания;
  - `lessonSkill(progress, lesson) -> 'independent'|'supported'|'needs_review'|'not_started'`:
    - `independent` — все задания с `transfer: true` выполнены `independent`;
    - `supported` — все выполнены, но хотя бы одно `supported`;
    - `needs_review` — у transfer-задания последний вердикт не `accepted`;
  - `courseCounts(progress, lexicon, lessons) -> { introduced, recognized, produced, appliedAfterBreak }`, где `recognized` — единицы, у которых `readOk || listenOk`.

- [ ] **Step 1: Write the failing test** — на мини-курсе P1 (`tests/fixtures/course/mini`):

```js
test('cards answer never counts as produced; write_he first try does', () => { /* record cards accepted → produced false; record write_he accepted → produced true */ });
test('transfer applied only after the break and only on an unseen fingerprint', () => {
  // markMet lx.tea at t0; transfer task accepted at t0 + 19 h → appliedAfterBreak false;
  // same task, a different variant, at t0 + 21 h → true; the same fingerprint again later → stays as before (no new evidence)
});
test('attempt timestamp before first meeting (clock skew) never counts as after-break', () => { /* at = t0 - 1 h → false */ });
test('lessonSkill: supported when the transfer was solved after opening the model', () => { /* openAid model → accepted → 'supported' */ });
test('courseCounts separates introduced, recognized, produced, applied', () => { /* exact numbers for the scripted sequence */ });
```

The implementer writes the bodies from the comments. In the last test, the expected numbers are worked out by hand from the scripted sequence and written as literals.

- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(course): item and lesson skill status, course counts`; push.

### Task 3: Миграция при новой версии урока

**Files:** Modify `public/js/course-evidence.js`; Test `tests/courseEvidence.test.js`

**Interfaces:**
- Produces: `migrate(progress, lesson) -> { progress, changes: Array<{ taskId, change: 'removed'|'spec_changed'|'unchanged' }> }`.

Правила:
- Если `progress.lessonVersions[lesson.id] === lesson.version` → возврат без изменений.
- Иначе для каждого `taskId`, у которого есть попытки:
  - задания нет в новой версии → `removed`, попытки остаются в истории;
  - `fingerprint(lesson.id, newTask)` не совпадает с `fp` последней попытки → `spec_changed`, у новых попыток `first` снова `true`, старые не считаются доказательством для нового отпечатка;
  - иначе → `unchanged`.
- `aids` удалённых и изменённых заданий сбрасываются.
- В конце записывается `lessonVersions[lesson.id] = lesson.version`.

- [ ] **Step 1: Write the failing test**

```js
test('renamed model changes the fingerprint: old success does not count for the new task', () => {
  // record task 9 accepted on version 1; lesson v2 with a different model text → change 'spec_changed';
  // itemStatus(...).produced still true from history, attemptLevel of the next attempt uses first === true
});
test('removed task keeps its attempts in history and drops its aids', () => {});
test('same version is a no-op', () => {});
```

- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(course): progress migration across lesson versions`; push.

### Task 4: Хранилище

**Files:** Create `public/js/course-store.js`; Test `tests/courseStore.test.js`

**Interfaces:**
- Produces (`CourseStore`):
  - `memoryStore() -> Store`;
  - `localStore(storage = globalThis.localStorage) -> Store`;
  - `Store = { load(courseId) -> { progress, notice?: 'reset_corrupt' }, save(progress) -> { ok: true } | { ok: false, reason: 'quota'|'unavailable' } }`;
  - ключ — `lp.course.<courseId>.v1`.
- `load`:
  - нет записи → `emptyProgress`;
  - JSON не читается или `schema !== 1` → старое значение копируется в `lp.course.<id>.v1:corrupt:<Date.now()>`, затем возвращается `emptyProgress` с `notice: 'reset_corrupt'`;
  - `storage` бросает исключение при доступе → `emptyProgress` с `notice: 'reset_corrupt'` и последующие `save` → `unavailable`.

- [ ] **Step 1: Write the failing test** — поддельный `storage` в стиле `localStorage` (`getItem`, `setItem`, `removeItem`) с переключателями `throwOnSet: 'QuotaExceededError'` и `throwOnAny`:

```js
test('round trip through localStore', () => {});
test('corrupt JSON resets with notice and keeps a backup copy', () => {});
test('quota on save returns ok:false reason quota and does not throw', () => {});
test('storage that throws on access yields reset and unavailable saves', () => {});
```

- [ ] **Step 2–4:** fail → implement → pass; затем `npm test` целиком → зелёный.
- [ ] **Step 5:** Commit `feat(course): progress store (memory, localStorage)`; push. Отчёт: `docs/research/hebrew-course/2026-11-05-p2-codex-report.md` в ветке (коммиты, итог `npm test`, отступления, непроверенное).
