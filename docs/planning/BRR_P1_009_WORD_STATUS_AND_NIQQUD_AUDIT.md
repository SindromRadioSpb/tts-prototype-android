# BRR-P1-009 — Цвет-статус слова в Зале + niqqud-audit (data-рычаг)

> **Канон-план (single source of truth, в репо).** Зеркало рабочего plan-mode файла
> `~/.claude/plans/linguistpro-node-js-pwa-playful-minsky.md`. Держать синхронно.
> **Дата:** 2026-06-11 · **Статус:** APPROVED (Опция 1'), в работе · **Роли:** R1/R2/R4/R5/R8.
> Норма (owner): планы — в `docs/planning/` (коммит) [[feedback_plans_in_repo]].

## Context (зачем)
После отгрузки тап-морфологии (BRR-P1-011) владелец заметил: «при тапе не всегда выходит
ожидаемое Pealim-слово». **Recon-first измерение (read-only, реальные работы) установило причину:**
- Качество резолва на вокализованных словах уже хорошее (~62% exact/likely).
- Доминирующая причина «не то слово» = **ПОКРЫТИЕ НИКУДОМ корпуса**: 56.6% overall, БИМОДАЛЬНО
  (15/39 работ 90–100%, **17/39 <60%**, 5 из них <20%). Зависит от того, какую работу открыл
  (вариативность бейка) — **НЕ алгоритм, НЕ выравнивание** (прототип alignment-фикса дал 0% эффекта).
- **Конкуренты НЕ лучше** (Pealim = тот же isolated form-first; авто-контекст-резолва нет ни у кого).
  Реальный потолок = контекстная Dicta, но она на современном иврите, **не валидирована на архаике**.

**Решение владельца — Опция 1':** на КОДЕ идём в keystone-roadmap (цвет-статус → i+1),
confidence-gated; ДАННЫЕ-никуд (доминирующий рычаг) чиним на **бейк-треке** через audit-инструмент.
Эскалация к Опции 3' (Dicta opt-in) — если confidence-gated coloring окажется слишком разреженным.

## Slice 1 — niqqud-audit (data-рычаг; ~0.5д)
NEW `scripts/premium/audit-corpus-niqqud.js` (`npm run audit:corpus-niqqud`): сканирует директорию
work-JSON (дефолт `public/data/benyehuda/works`, `--dir` для shards/тома) → per-work % вокализованных
слов (reuse `ReaderMorph.words`/`stripNiqqud` + vowel-проба `[ְ-ׇ]`) → сортированный отчёт +
сводка + **id-список работ < `--threshold` (дефолт 60%)** → `.tmp/benyehuda/reniqqud-ids.json` (gitignored).
**Замыкает data-loop существующими инструментами:** `run-corpus-prebake --bake --ids-file
.tmp/benyehuda/reniqqud-ids.json` (перебейк с Dicta-никудом) → `publish-corpus-batch` → прод (тот же
`--ids-file`-механизм, что A5). Read-only аудит; перебейк/публикация — owner/бейк-трек. Комплементарен
`probe:niqqud` (overall по shards; этот — per-work для таргет-перебейка).

## Slice 2 — цвет-статус слова (BRR-P1-009; ~1.5–2д; confidence-gated)
LingQ-сигнатура на нашей морфо-глубине: слова в тексте красятся по статусу обучения пользователя —
**только по уверенному резолву** (label∈{exact,likely}); неуверенные/невокализованные нейтральны
(честно — и естественно мотивирует niqqud-перебейк, связка со Slice 1).
- **NEW `local-db.js#getKnownWordStates()` → `{lemmaKey: state}`.** Перечислить word_study заметки
  (`json_extract(body_json,'$.lemma'/'$.pos'/'$.pealim_id') FROM notes_v2 WHERE note_type='word_study'`)
  → `lemmaKey` (канон `NotesAutoGen.lemmaKey`: `pid:<id>` иначе `norm(lemma)#pos`) → `state =
  getLearningStateOverlay()[note_id] || 'new'`. Reuse `getLearningStateOverlay` (local-db.js:1920,
  standalone, graceful `{}` без SRS). Один запрос/открытие (<150мс), кэш на сессию.
- **`reader-morph.js#paintLearningStatus(mount, statesMap)`:** по обёрнутым `.rm-w` словам →
  `resolveCore` (warm-движок, <1мс/слово) → `lemmaKey` из card → класс `rm-w-known`/`rm-w-learning`/
  `rm-w-new` (known / learning|weak|stale / new) ТОЛЬКО при exact|likely; иначе без класса.
  Прогрессивно (видимые ряды → остальное idle). Карточка тоже показывает «статус: …».
- **Opt-in (perf/offline-честность):** тумблер reader-aids «🎨 Статус слов» (дефолт OFF, persist).
  ON → warm-движок (3.3МБ дикт) + paint. Дефолт-открытие остаётся лёгким.
- **library.html:** CSS `.rm-w-known/-learning/-new` (subtle, RTL-safe, dark-aware) + тумблер;
  i18n `room.status.*`. **SW CACHE_VERSION bump.** index.html НЕ трогать.

## i+1 «Следующий для тебя» (BRR-P1-007) — SEQUENCED follow-on (НЕ в этом слайсе)
Нужен **per-work vocab-профиль** (lemma-keys на работу), сегодня НЕ существует. Рекоменд. строить на
**publish-time** (`corpus-vocab-v<N>.json` sidecar) → coverage = |known ∩ work_vocab| → рекоменд. работы
в зоне i+1 (60–80% known) + frontier>0. Reuse `getTextLearningCoverage`/`rankRoots`. Отдельный recon
после Slice 2 + проверки качества coloring.

## Файлы
NEW `scripts/premium/audit-corpus-niqqud.js` + `package.json` · `public/db/local-db.js`
(`getKnownWordStates`) · `public/js/reader-morph.js` (`paintLearningStatus`) · `public/js/library-ui.js`
(тумблер+warm+paint) · `public/library.html` (CSS+тумблер) · `public/i18n/locales/{ru,en,he}.js`
(`room.status.*`) · `public/sw.js` (bump) · NEW `scripts/premium/reader-status-smoke.js`
(`smoke:reader-status`). **index.html НЕ трогать.**

## Reuse
`getLearningStateOverlay` (local-db.js:1920) · `NotesAutoGen.lemmaKey` (notes-autogen.js:355) ·
`ReaderMorph.resolveCore/words/stripNiqqud/attach` · `buildAidsPanel` тумблер-паттерн (library-ui.js) ·
`run-corpus-prebake --ids-file` (A5).

## Фазировка / Гейты / Verification
- S1 audit → S2a `getKnownWordStates`+Node-тест → S2b paint+тумблер+CSS+i18n (@380px скрин) →
  S2c `smoke:reader-status` → S3 SW bump+commit+push+PROD-верифи.
- Гейты: `audit:corpus-niqqud` · `smoke:reader-status` · `smoke:reader-morph` · `smoke:reader-parity`
  (builder не тронут) · corpus-nav 33 · corpus-room 18 · room 14 · room-mode 23 · `audit:autogen-quality`
  · `test:api-smoke`. R1: 0 покрашенных по неуверенному резолву.
- Verify: seed word_study-заметку (известное слово) → тумблер → зелёное/жёлтое/нейтрально; @380px RTL.

## 🆕 Note-layer / learner-loop (owner 2026-06-11, скрин IMG_3965)
Владелец: перенять формирование заметки Студии в Зал; «нужно предварительное превращение слов в
заметки». Решение: **целевой UX = rich word-card (Вариант B), стадийно**, progressive disclosure
(сверху быстрое понимание + «Сохранить»; грамматика ниже/сворачиваемо). Eager auto-notes — НЕ дефолт
(позже opt-in). **Stage 1 (этот слайс) замыкает loop:** тап→карточка→«Сохранить»(=word_study-заметка
reuse `createCanonicalNote` source:'curated' + occurrence, идемпотентно)→lifecycle-бейдж→цвет-статус→
Anki→i+1-ready. **Stage 2 (next):** корне-семья + Pealim-таблица склонения (порт `v3RenderInflectionParadigm`).

## Статус-лог
- 2026-06-11: recon + измерение (никуд 56.6% бимодально; alignment-фикс 0%; конкуренты не лучше);
  Опция 1' утверждена. Начат S1.
- 2026-06-11: **Stage 1 ОТГРУЖЕНО-как-код** (SW `v3.10.26-room-notes`): niqqud-audit (110 работ <60%);
  `getKnownWordStates`; цвет-статус (тумблер «🎨 Статус слов», opt-in, confidence-gated) +
  note-capture («Сохранить слово» → заметка + occurrence + lifecycle-бейдж + toast, идемпотентно).
  Гейты зелёные: `smoke:reader-notes` · reader-morph(14+smoke) · reader-parity · corpus-nav 33 ·
  corpus-room 18 · room 14 · room-mode 23 · autogen-quality 0 R1 · api-smoke · audit:corpus-niqqud.
  Файлы: `reader-morph.js`(save/lifecycle/paint) · `library-ui.js`(glue/тумблер/toast) ·
  `local-db.js`(`getKnownWordStates`) · `library.html`(CSS) · locales(`room.morph.*`) ·
  `audit-corpus-niqqud.js` · `reader-notes-smoke.js`. index.html НЕ тронут. Commit `ca08b57`.
- 2026-06-11: **Stage 1 PROD-ВЕРИФИЦИРОВАНО** (linguistpro.kolosei.com, SW v3.10.26-room-notes):
  тап→карточка(«заря, рассвет»/«точно»/lifecycle)→«Сохранить»→«✓ В заметках»+toast; «Статус слов»
  покрасил 70 слов; 0 pageerror; @380px RTL скрин. **Loop замкнут в проде. NEXT = Stage 2**
  (корне-семья + Pealim-таблица склонения, порт `v3RenderInflectionParadigm`). Параллельно
  owner/бейк-трек: перебейк 110 работ <60% никуда (`reniqqud-ids.json` → run-corpus-prebake → publish).
- 2026-06-11: **Stage 2 ОТГРУЖЕНО-как-код** (SW v3.10.28-room-conj, owner-запрос «1:1 + озвучка форм»):
  богатая карточка 1:1 как в Студии — NEW `public/js/inflection-render.js` (faithful-порт
  `v3RenderInflectionParadigm` + pronoun-set + константы/хелперы + `v3ConjSpeak`; **index.html НЕ тронут**,
  своя копия как reader-core) → сворачиваемые «Слова от этого корня» (root→lemmas из офлайн-дикта,
  самодостаточно) + «Спряжение / Склонение» (полная Pealim-таблица: огласовка+транслит per cell,
  **тап формы → озвучка** browser-TTS, как в Студии; R1: формы из Pealim, голос = TTS, не запись).
  `reader-morph`: `paradigm` на карточке + `rootIndex` в ensureEngine + chip-таб (→ карточка родств. слова).
  Гейты зелёные: reader-notes · reader-morph · reader-parity · corpus-nav 33 · corpus-room 18 · room 14 ·
  room-mode 23 · api-smoke. Local verify: השחר → 24 ячейки / 4 группы / 24 tap-озвучки / 5 корне-чипов /
  Pealim-бейдж / 0 pageerror. **NEXT: prod-verify.**
