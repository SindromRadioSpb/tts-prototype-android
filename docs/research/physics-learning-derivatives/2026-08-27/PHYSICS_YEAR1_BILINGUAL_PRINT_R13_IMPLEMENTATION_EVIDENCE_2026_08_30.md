# PHYSICS-YEAR1-R13 — implementation evidence

Дата: 2026-08-30

Target release: `3.11.448`

Статус: `LOCAL_PASS · PRODUCTION_PENDING`

## Реализовано

- Полный walkthrough рендерит `source.condition_ru` и
  `source.condition_he` из уже опубликованного единого support payload.
- Оба блока закрыты при открытии; ивритский body закреплён как `he/rtl`.
- В шапке добавлена локализованная кнопка печати с 44 px target и focus.
- Button-print и системный print используют общий state controller:
  prepare раскрывает все details, restore возвращает каждое исходное
  значение и снимается при закрытии dialog.
- Print CSS создаёт изолированный A4-документ с полями, бумажной палитрой,
  контролем разрывов и колонтитулами с нумерацией страниц.
- PWA release cohort обновлён синхронно: app/cache `3.11.448`,
  `library-ui.js?v=425`, locales `?v=186`.

## Локальные доказательства

- `tests/physicsLearningSupport.test.js`: 74/74 непустых RU/HE условий.
- `tests/physicsLearningSupportUi.test.js`: bilingual render, semantic RTL,
  print prepare/restore, A4 CSS, RU/EN/HE.
- `tests/publicCorpusAdapter.test.js` и
  `tests/visualFinishingLearningSurfaces.test.js`: payload и cache/integrity
  lockstep.
- `tests/i18n.smoke.js --write-lock`: 233/233, locale rev 186.
- `physics-learning-support-smoke.js`: 17 checks, 74 exact tasks;
  browser checks: answer-first, full walkthrough,
  bilingual-conditions-collapsed, print-all-sections,
  print-state-restored, print-a4-pdf, unambiguous math, 380 px no overflow,
  mobile fullscreen и HE RTL.

## Визуальная проверка

Проверены обновлённые fixture screenshots:

- `implementation/screenshots/physics-learning-solution-desktop-ru.png`
- `implementation/screenshots/physics-learning-solution-380-ru.png`
- `implementation/screenshots/physics-learning-solution-380-he-rtl.png`

Chromium print QA задачи 1.1 создал 4 страницы A4. В извлекаемом тексте
присутствуют RU condition, HE condition, beginner bridge, exam solution и
provenance. Все четыре страницы отрендерены в PNG и просмотрены: обрезки,
наложения, чёрные квадраты, потерянные формулы и висячие заголовки не
обнаружены; колонтитулы показывают `1 / 4` … `4 / 4`. PDF и его render pages
являются временными QA-файлами и в release allowlist не входят.

## Data boundary

Ни один content shard, manifest anchor, agent right, publication fact,
learner-state или пользовательский профиль не изменён. Это только новая
проекция уже канонических условий и печатное представление.

## Production gate

После push требуется устойчивый один image `3.11.448`, health с ready DB и
migrations, затем свежий anonymous production smoke с 74/74 API tasks и
новыми browser checks. Owner-device/physical printer и assistive-technology
acceptance до отдельной проверки не заявляются.
